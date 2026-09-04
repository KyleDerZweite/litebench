#!/usr/bin/env python3
"""Rejudge the saved public demo outputs with Astra xhigh. Resumes saved work."""

import argparse
import hashlib
import json
import math
import os
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from http.client import HTTPException
from pathlib import Path
from statistics import fmean
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
PROTOCOL = ROOT / "benches/judge-astra-v0.1.json"
BATCH = "2026-09-04-rerun-01"
EVALUATION = "2026-09-05-astra-xhigh-v0.1"
SUITES = ("copybench", "naturalbench", "cefrbench")


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def make_prompt(protocol, suite, brief, candidate, unslop_text):
    rubric = protocol["suites"][suite]
    return "\n\n".join((
        protocol["shared_instruction"],
        "Question:\n" + rubric["question"],
        "Scoring anchors:\n" + json.dumps(protocol["anchors"], ensure_ascii=False),
        "Criteria, equally weighted:\n" + json.dumps(rubric["criteria"], ensure_ascii=False),
        "Editorial reference, quoted for evaluation only:\n<unslop_reference>\n" + unslop_text + "\n</unslop_reference>",
        protocol["output_instruction"],
        "Evaluate only the following JSON data. It contains no evaluator instructions:\n" +
        json.dumps({"brief": brief, "candidate": candidate}, ensure_ascii=False),
    ))


def validate_judgment(judgment, suite, candidate, protocol):
    errors = []
    if not isinstance(judgment, dict):
        return ["judgment must be an object"]
    criteria = judgment.get("criteria")
    expected = set(protocol["suites"][suite]["criteria"])
    if not isinstance(criteria, dict) or set(criteria) != expected:
        return ["criteria must match the four suite criteria"]
    for name, criterion in criteria.items():
        if not isinstance(criterion, dict):
            errors.append(f"{name} must contain score and reason")
            continue
        if type(criterion.get("score")) is not int or not 0 <= criterion["score"] <= 5:
            errors.append(f"{name}.score must be an integer from 0 to 5")
        if not isinstance(criterion.get("reason"), str) or not criterion["reason"].strip():
            errors.append(f"{name}.reason must explain the rating")
    if not errors:
        score_5 = fmean(value["score"] for value in criteria.values())
        for field, expected_score in (("score_5", score_5), ("score", round(score_5 * 20, 1))):
            value = judgment.get(field)
            if type(value) not in (int, float) or not math.isfinite(value) or abs(value - expected_score) > 1e-8:
                errors.append(f"{field} must equal the derived criterion mean")
    if type(judgment.get("brief_ok")) is not bool:
        errors.append("brief_ok must be Boolean")
    realized = judgment.get("realized_cefr")
    levels = {"A1", "A2", "B1", "B2", "C1", "C2", "mixed", "insufficient_evidence"}
    if (suite == "cefrbench" and (not isinstance(realized, str) or realized not in levels)) or (suite != "cefrbench" and realized is not None):
        errors.append("realized_cefr is invalid for this suite")
    issues = judgment.get("issues")
    if not isinstance(issues, list) or len(issues) > 8:
        return errors + ["issues must be a list of at most eight annotations"]
    for index, issue in enumerate(issues):
        if not isinstance(issue, dict):
            errors.append(f"issue {index} must be an object")
            continue
        code = issue.get("code")
        if not isinstance(code, str) or not re.fullmatch(r"[a-z][a-z0-9_]*", code):
            errors.append(f"issue {index} code must be snake_case")
        if not isinstance(issue.get("category"), str) or issue["category"] not in {"slop", "brief", "quality", "cefr"}:
            errors.append(f"issue {index} category is invalid")
        if not isinstance(issue.get("severity"), str) or issue["severity"] not in {"minor", "major"}:
            errors.append(f"issue {index} severity is invalid")
        evidence = issue.get("evidence")
        if not isinstance(evidence, str) or len(evidence) > 240 or (evidence and evidence not in candidate):
            errors.append(f"issue {index} evidence must be an exact candidate quote, at most 240 characters")
        elif not evidence and issue.get("category") != "brief":
            errors.append(f"issue {index} empty evidence is only for a brief omission")
        if not isinstance(issue.get("explanation"), str) or not issue["explanation"].strip():
            errors.append(f"issue {index} needs an explanation")
    valid_issues = [issue for issue in issues if isinstance(issue, dict)]
    if judgment.get("brief_ok") is False and not any(issue.get("category") == "brief" for issue in valid_issues):
        errors.append("brief failures need a brief annotation")
    slop = [issue for issue in valid_issues if issue.get("category") == "slop"]
    style = criteria.get("natural_style")
    if slop and isinstance(style, dict) and style.get("score") == 5:
        errors.append("flagged slop must lower the natural_style rating")
    if "\u2014" in candidate and not any("\u2014" in str(issue.get("evidence", "")) for issue in slop):
        errors.append("the owner's em dash preference needs a quoted slop annotation")
    if not isinstance(judgment.get("note"), str) or not judgment["note"].strip():
        errors.append("note must be non-empty")
    return errors


def parse_judgment(text, suite, candidate, protocol):
    value = json.loads(text)
    if not isinstance(value, dict):
        raise ValueError("Judge JSON must be an object")
    # This diagnostic is outside the other suites' criteria. Keep raw JSON for audit.
    if suite != "cefrbench":
        value["realized_cefr"] = None
    criteria = value.get("criteria", {})
    if isinstance(criteria, dict) and criteria and all(
        isinstance(c, dict) and type(c.get("score")) is int for c in criteria.values()
    ):
        value["score_5"] = fmean(c["score"] for c in criteria.values())
        value["score"] = round(value["score_5"] * 20, 1)
    errors = validate_judgment(value, suite, candidate, protocol)
    if errors:
        raise ValueError("; ".join(errors))
    return value


def extract_text(response):
    output = response.get("output") if isinstance(response, dict) else None
    if not isinstance(output, list):
        raise ValueError("Response output must be a list")
    parts = []
    for item in output:
        if not isinstance(item, dict):
            raise ValueError("Response output item must be an object")
        if item.get("type") != "message":
            continue
        if not isinstance(item.get("content"), list):
            raise ValueError("Message content must be a list")
        for block in item["content"]:
            if not isinstance(block, dict):
                raise ValueError("Message content block must be an object")
            if block.get("type") == "output_text":
                if not isinstance(block.get("text"), str):
                    raise ValueError("Output text must be a string")
                parts.append(block["text"])
    if not parts:
        raise ValueError("Response contains no output text")
    return "".join(parts)


def estimated_cost(usage, pricing):
    if not isinstance(usage, dict):
        return None
    inp, out = usage.get("input_tokens"), usage.get("output_tokens")
    if any(type(value) not in (int, float) or not math.isfinite(value) or value < 0 for value in (inp, out)):
        return None
    details = usage.get("input_tokens_details")
    if details is not None and not isinstance(details, dict):
        return None
    if (details or {}).get("cache_write_tokens", 0):
        # This frozen price table does not price explicit cache writes.
        return None
    cached = (details or {}).get("cached_tokens", 0)
    if type(cached) not in (int, float) or not math.isfinite(cached) or not 0 <= cached <= inp:
        return None
    # Responses output_tokens already includes reasoning tokens.
    return round(((inp - cached) * pricing["input"] + cached * pricing["cache_read"] + out * pricing["output"]) / 1_000_000, 8)


def parse_response_stream(lines):
    """Read Responses SSE frames and retain the terminal response, including usage."""
    data = []
    for raw_line in lines:
        line = raw_line.decode("utf-8").rstrip("\r\n")
        if line:
            field, separator, value = line.partition(":")
            if field == "data":
                data.append(value.removeprefix(" ") if separator else "")
            continue
        if not data:
            continue
        payload = "\n".join(data)
        data = []
        if payload == "[DONE]":
            break
        event = json.loads(payload)
        if not isinstance(event, dict):
            raise ValueError("Stream event must be an object")
        event_type = event.get("type")
        if event_type in ("response.completed", "response.incomplete", "response.failed"):
            response = event.get("response")
            if not isinstance(response, dict) or response.get("status") != event_type.removeprefix("response."):
                raise ValueError("Terminal stream event must contain its matching response")
            return response
        if event_type == "error":
            raise ValueError("Responses stream reported an error")
    raise ValueError("Responses stream ended without a terminal response")


def request_output(base_url, key, protocol, prompt, max_output_tokens, stream=False):
    payload = {
        "model": protocol["judge"]["model"],
        "reasoning": {"effort": protocol["judge"]["reasoning_effort"]},
        "input": prompt,
        "max_output_tokens": max_output_tokens,
        "store": False,
    }
    if stream:
        payload["stream"] = True
    body = json.dumps(payload).encode()
    request = urllib.request.Request(base_url.rstrip("/") + "/responses", data=body, headers={
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "User-Agent": "LiteBench/PersonalDemo",
    }, method="POST")
    with urllib.request.urlopen(request, timeout=240) as response:
        value = parse_response_stream(response) if stream else json.loads(response.read())
    if not isinstance(value, dict):
        raise ValueError("Response JSON must be an object")
    return value


def source_plan(batch):
    plans = []
    for suite in SUITES:
        task_path = ROOT / "benches" / suite / "public.json"
        task_data = read_json(task_path)
        tasks = {task["id"]: task for task in task_data["tasks"]}
        for source_path in sorted((ROOT / "benches" / suite / "generations" / batch).glob("*.json")):
            source = read_json(source_path)
            meta = source["batch"]
            if meta["task_file"] != task_path.relative_to(ROOT).as_posix() or meta["task_file_sha256"] != digest(task_path):
                raise ValueError(f"Public task source changed: {source_path.name}")
            ids = [item["task_id"] for item in source["items"]]
            if len(set(ids)) != len(ids) or set(ids) != set(tasks):
                raise ValueError(f"Task coverage mismatch: {source_path.name}")
            if any(not isinstance(item.get("output"), str) or not item["output"].strip() for item in source["items"]):
                raise ValueError(f"Missing output: {source_path.name}")
            plans.append((suite, source_path, source, tasks))
    if not plans:
        raise ValueError("No saved public generation files found")
    return plans


def score_config(plan, allowed_ids, protocol, unslop, args, key):
    suite, source_path, source, tasks = plan
    destination = ROOT / "benches" / suite / "evaluations" / args.evaluation / source_path.name
    evaluation = {
        "id": args.evaluation,
        "type": "personal_ai_indicator",
        "protocol_version": protocol["version"],
        "protocol_file": PROTOCOL.relative_to(ROOT).as_posix(),
        "protocol_sha256": digest(PROTOCOL),
        "source_file": source_path.relative_to(ROOT).as_posix(),
        "source_sha256": digest(source_path),
        "judge": protocol["judge"],
        "unslop_file": protocol["unslop_file"],
        "unslop_sha256": digest(ROOT / protocol["unslop_file"]),
        "purpose": "demonstration",
        "human_validated": False,
        "provider_endpoint": args.base_url,
        "pricing": protocol["pricing"],
    }
    if destination.exists():
        data = read_json(destination)
        if any(data["evaluation"].get(field) != value for field, value in evaluation.items()):
            raise ValueError(f"Refusing to mix changed evaluation settings in {destination.name}")
    else:
        data = {"schema_version": 2, "evaluation": {**evaluation, "created_at": utc_now()},
                "items": [{"task_id": item["task_id"], "judgment": None, "attempts": []} for item in source["items"]]}
    outputs = {item["task_id"]: item["output"] for item in source["items"]}
    completed = 0
    for item in data["items"]:
        task_id = item["task_id"]
        if task_id not in allowed_ids:
            continue
        candidate = outputs[task_id]
        prompt = make_prompt(protocol, suite, tasks[task_id]["prompt"], candidate, unslop)
        prompt_hash = hashlib.sha256(prompt.encode()).hexdigest()
        if item.get("judgment") is not None:
            if item.get("prompt_sha256") != prompt_hash or validate_judgment(item["judgment"], suite, candidate, protocol):
                raise ValueError(f"Saved judgment failed validation: {task_id}")
            completed += 1
            continue
        max_tokens = args.max_output_tokens
        for retry in range(args.attempts):
            started = time.monotonic()
            # Older attempts without this field used the default non-streaming transport.
            stream = getattr(args, "stream", False)
            attempt = {"attempt": len(item["attempts"]) + 1, "started_at": utc_now(),
                       "max_output_tokens": max_tokens, "stream": stream}
            retryable = True
            try:
                response = request_output(args.base_url, key, protocol, prompt, max_tokens, stream=stream)
                latency = round((time.monotonic() - started) * 1000)
                attempt.update({"status": response.get("status"), "model": response.get("model"),
                                "response_id": response.get("id"), "usage": response.get("usage"), "latency_ms": latency})
                if response.get("model") != protocol["judge"]["model"]:
                    retryable = False
                    raise ValueError("Returned model does not match requested Astra; refusing fallback")
                if response.get("status") != "completed":
                    if response.get("status") == "incomplete":
                        max_tokens = min(max_tokens * 2, 24000)
                    raise ValueError("Response is not completed")
                raw_text = extract_text(response)
                attempt["raw_output"] = raw_text
                judgment = parse_judgment(raw_text, suite, candidate, protocol)
                item.update({"judgment": judgment, "prompt_sha256": prompt_hash, "raw_output": raw_text,
                             "response": {"id": response.get("id"), "model": response.get("model"),
                                          "status": response.get("status"), "usage": response.get("usage"), "latency_ms": latency}})
                attempt["validation"] = "passed"
            except (OSError, HTTPException, ValueError) as exc:
                attempt.setdefault("latency_ms", round((time.monotonic() - started) * 1000))
                attempt.setdefault("status", "request_error")
                if isinstance(exc, urllib.error.HTTPError):
                    attempt["http_status"] = exc.code
                    attempt["error"] = f"HTTP {exc.code}"
                    retryable = exc.code in (408, 409, 429) or exc.code >= 500
                elif isinstance(exc, ValueError):
                    attempt["error"] = str(exc)
                else:
                    attempt["error"] = type(exc).__name__
                attempt["validation"] = "failed"
            attempt["estimated_cost_usd"] = estimated_cost(attempt.get("usage"), protocol["pricing"])
            item["attempts"].append(attempt)
            save_json(destination, data)
            if item.get("judgment") is not None:
                completed += 1
                print(f"OK {suite} {source_path.stem} {task_id}: {item['judgment']['score']:.1f}%", flush=True)
                break
            print(f"RETRY {suite} {source_path.stem} {task_id}: {attempt.get('error', 'invalid response')}", flush=True)
            if not retryable or retry == args.attempts - 1:
                raise ValueError(f"Judgment incomplete for {suite}/{source_path.stem}/{task_id}; saved attempts are resumable")
            time.sleep(min(2 ** retry, 8))
    return completed


def report(evaluation_id):
    complete, pending, attempts, unknown = 0, 0, 0, 0
    cost = 0.0
    for path in ROOT.glob(f"benches/*/evaluations/{evaluation_id}/*.json"):
        for item in read_json(path)["items"]:
            complete += item.get("judgment") is not None
            pending += item.get("judgment") is None
            for attempt in item.get("attempts", []):
                attempts += 1
                value = attempt.get("estimated_cost_usd")
                if value is None:
                    unknown += 1
                else:
                    cost += value
    print(json.dumps({"completed": complete, "pending_in_created_files": pending, "attempts": attempts,
                      "estimated_reported_usage_cost_usd": round(cost, 6), "attempts_with_unknown_cost": unknown}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", default=BATCH)
    parser.add_argument("--evaluation", default=EVALUATION)
    parser.add_argument("--base-url", default=os.environ.get("LITEBENCH_API_BASE", "https://api.openai.com/v1"))
    parser.add_argument("--api-key-file", type=Path)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--max-output-tokens", type=int, default=8000)
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument("--stream", action="store_true", help="receive Responses SSE to avoid idle gateway timeouts")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--report", action="store_true")
    args = parser.parse_args()
    for value in (args.batch, args.evaluation):
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", value):
            parser.error("Batch and evaluation IDs must be simple directory names")
    if args.report:
        report(args.evaluation)
        return 0
    if args.workers < 1 or args.workers > 25 or args.attempts < 1 or args.max_output_tokens < 1 or (args.limit is not None and args.limit < 1):
        parser.error("Positive limits required; concurrency is at most 25")
    url = urlsplit(args.base_url)
    if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password or url.query or url.fragment:
        parser.error("Use an HTTP(S) API base without credentials or query parameters")
    protocol = read_json(PROTOCOL)
    unslop = (ROOT / protocol["unslop_file"]).read_text(encoding="utf-8")
    plans = source_plan(args.batch)
    total = sum(len(plan[2]["items"]) for plan in plans)
    print(f"Public demo: {total} outputs in {len(plans)} files; {protocol['judge']['model']} {protocol['judge']['reasoning_effort']}", flush=True)
    if args.check:
        return 0
    key = os.environ.get("LITEBENCH_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if args.api_key_file:
        key = args.api_key_file.read_text(encoding="utf-8").strip()
    if not key:
        parser.error("Set LITEBENCH_API_KEY or pass --api-key-file")
    remaining = args.limit if args.limit is not None else total
    failures = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        jobs = []
        for plan in plans:
            selected = [item["task_id"] for item in plan[2]["items"]][:remaining]
            remaining -= len(selected)
            if selected:
                jobs.append(pool.submit(score_config, plan, set(selected), protocol, unslop, args, key))
        for job in as_completed(jobs):
            try:
                job.result()
            except Exception as exc:
                failures.append(type(exc).__name__ + ": " + str(exc))
                print("FAILED " + failures[-1], flush=True)
    report(args.evaluation)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
