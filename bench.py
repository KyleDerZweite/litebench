#!/usr/bin/env python3
"""Validate LiteBench's demonstration data and build its personal results page."""

import argparse
import copy
import hashlib
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from statistics import fmean

ROOT = Path(__file__).resolve().parent
PUBLIC_TASKS = ROOT / "benches/copybench/public.json"
LEADERBOARD = ROOT / "visualizer/data/leaderboard.json"
PRICING = ROOT / "pricing.json"
EVALUATION = "2026-09-05-astra-xhigh-v0.1"
GENERATION = "2026-09-04-rerun-01"
PROTOCOL = "benches/judge-astra-v0.1.json"
UNSLOP = "benches/unslop-v1.md"
SUITES = {"copybench": "CopyBench Lite", "naturalbench": "NaturalBench Lite", "cefrbench": "CEFRBench Lite"}
DETAIL_FIELDS = ("input_tokens", "output_tokens", "total_tokens", "latency_ms")


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Cannot read {path}: {exc}") from exc


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def indexed_items(items, key="task_id"):
    if not isinstance(items, list) or not items:
        raise ValueError("expected a non-empty items list")
    result = {}
    for item in items:
        identity = item.get(key) if isinstance(item, dict) else None
        if not isinstance(identity, str) or not identity or identity in result:
            raise ValueError(f"every {key} must be unique and non-empty")
        result[identity] = item
    return result


def load_tasks(path):
    data = read_json(path)
    tasks = data.get("tasks") if isinstance(data, dict) else None
    indexed_items(tasks, "id")
    if any(not isinstance(task.get("prompt"), str) or not task["prompt"] for task in tasks):
        raise ValueError(f"{path}: every task needs a prompt")
    return data, tasks


def task_set_name(data):
    return f"{data.get('name', 'tasks')}-{data.get('version', 'unknown')}"


def require_hash(path, expected):
    if sha256(path) != expected:
        raise ValueError(f"{path}: SHA-256 does not match")


def load_generation(path, suite):
    path = Path(path).resolve()
    public_dir = ROOT / "benches" / suite / "generations"
    if not path.is_relative_to(public_dir.resolve()) or not path.is_file():
        raise ValueError("generation source must be inside the matching public generations directory")
    data = read_json(path)
    batch = data.get("batch") if isinstance(data, dict) else None
    if not isinstance(data, dict) or data.get("schema_version") != 1 or not isinstance(batch, dict):
        raise ValueError(f"{path}: expected schema 1 and batch metadata")
    task_file = f"benches/{suite}/public.json"
    if batch.get("suite") != suite or batch.get("task_file") != task_file:
        raise ValueError(f"{path}: batch must reference its suite's public task file")
    require_hash(ROOT / task_file, batch.get("task_file_sha256"))
    task_data, tasks = load_tasks(ROOT / task_file)
    if batch.get("task_set") != task_set_name(task_data):
        raise ValueError(f"{path}: task set does not match")
    for field in ("model", "reasoning_effort", "id"):
        if not isinstance(batch.get(field), str) or not batch[field]:
            raise ValueError(f"{path}: batch.{field} is required")
    items = indexed_items(data.get("items"))
    if set(items) != {task["id"] for task in tasks}:
        raise ValueError(f"{path}: generation task coverage does not match public tasks")
    if any(not isinstance(item.get("output"), str) or not isinstance(item.get("generation"), dict) for item in items.values()):
        raise ValueError(f"{path}: every item needs its original output and generation metadata")
    return data, tasks


def load_evaluation(path):
    from judge import make_prompt, parse_judgment, validate_judgment

    path = Path(path).resolve()
    try:
        parts = path.relative_to(ROOT).parts
    except ValueError as exc:
        raise ValueError("evaluation must be inside the repository") from exc
    if len(parts) != 5 or parts[0] != "benches" or parts[1] not in SUITES or parts[2] != "evaluations":
        raise ValueError("evaluation must be inside a public suite's evaluations directory")
    suite = parts[1]
    data = read_json(path)
    if not isinstance(data, dict) or data.get("schema_version") != 2 or not isinstance(data.get("evaluation"), dict):
        raise ValueError(f"{path}: expected evaluation schema 2")
    evaluation = data["evaluation"]
    if evaluation.get("id") != parts[3]:
        raise ValueError(f"{path}: evaluation id does not match directory")
    if evaluation.get("judge") != {"model": "gpt-6-astra", "reasoning_effort": "xhigh"}:
        raise ValueError(f"{path}: judge must be GPT-6-Astra xhigh")
    if evaluation.get("purpose") != "demonstration" or evaluation.get("human_validated") is not False:
        raise ValueError(f"{path}: expected demonstration, without human validation")
    for field, expected_path in (("protocol", PROTOCOL), ("unslop", UNSLOP)):
        if evaluation.get(f"{field}_file") != expected_path:
            raise ValueError(f"{path}: unexpected {field} file")
        require_hash(ROOT / expected_path, evaluation.get(f"{field}_sha256"))
    protocol = read_json(ROOT / PROTOCOL)
    if evaluation.get("protocol_version") != protocol["version"]:
        raise ValueError(f"{path}: protocol version does not match")
    source_file = evaluation.get("source_file")
    if not isinstance(source_file, str):
        raise ValueError(f"{path}: source_file is required")
    source = ROOT / source_file
    generation, tasks = load_generation(source, suite)
    require_hash(source, evaluation.get("source_sha256"))
    source_items, items = indexed_items(generation["items"]), indexed_items(data.get("items"))
    if set(items) != set(source_items):
        raise ValueError(f"{path}: evaluation task coverage does not match generations")
    joined = []
    unslop_text = (ROOT / UNSLOP).read_text(encoding="utf-8")
    for task in tasks:
        task_id = task["id"]
        item, original = items[task_id], source_items[task_id]
        errors = validate_judgment(item.get("judgment"), suite, original["output"], protocol)
        if errors:
            raise ValueError(f"{path}: {task_id}: {'; '.join(errors)}")
        if not isinstance(item.get("raw_output"), str) or parse_judgment(item["raw_output"], suite, original["output"], protocol) != item["judgment"]:
            raise ValueError(f"{path}: {task_id}: saved judgment does not match the raw judge JSON")
        prompt = make_prompt(protocol, suite, task["prompt"], original["output"], unslop_text)
        if item.get("prompt_sha256") != hashlib.sha256(prompt.encode()).hexdigest():
            raise ValueError(f"{path}: {task_id}: judge prompt hash does not match")
        response = item.get("response")
        if not isinstance(response, dict) or not isinstance(response.get("usage"), dict):
            raise ValueError(f"{path}: {task_id}: response usage is required")
        if response.get("model") != "gpt-6-astra" or response.get("status") != "completed":
            raise ValueError(f"{path}: {task_id}: expected a completed Astra response")
        if not isinstance(item.get("attempts"), list) or not item["attempts"]:
            raise ValueError(f"{path}: {task_id}: attempt metadata is required")
        joined.append({"task_id": task_id, "output": original["output"],
                       "generation": {field: original["generation"].get(field) for field in DETAIL_FIELDS},
                       "score": item["judgment"]["score"], "judgment": item["judgment"]})
    return suite, data, generation, tasks, joined


def numeric(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def generation_summary(data, pricing):
    batch, items = data["batch"], data["items"]
    metadata = [item["generation"] for item in items]
    result = {field: batch.get(field, "") for field in ("model", "provider", "reasoning_effort")}
    result.update(date=batch.get("created_at", "")[:10], generated=len(items), total=len(items))
    for field in DETAIL_FIELDS:
        values = [entry.get(field) for entry in metadata]
        result[f"average_{field}"] = round(fmean(values)) if all(numeric(value) for value in values) else None
    costs, basis = [entry.get("cost_usd") for entry in metadata], "reported"
    if not all(numeric(value) for value in costs):
        basis, costs = "estimated", []
        rates = pricing.get("models", {}).get(batch["model"])
        for entry in metadata:
            input_tokens = entry.get("input_tokens")
            output_tokens = entry.get("billable_output_tokens", entry.get("output_tokens"))
            if not rates or not numeric(input_tokens) or not numeric(output_tokens):
                break
            costs.append((input_tokens * rates["input"] + output_tokens * rates["output"]) / 1_000_000)
    complete = len(costs) == len(items) and all(numeric(value) for value in costs)
    result["average_cost_usd"] = round(fmean(costs), 6) if complete else None
    result["cost_basis"] = basis if complete else "unavailable"
    return result


def evaluation_paths(evaluation_id):
    if not re.fullmatch(r"[A-Za-z0-9._-]+", evaluation_id):
        raise ValueError("evaluation id must be a directory name")
    return sorted(path for suite in SUITES for path in (ROOT / "benches" / suite / "evaluations" / evaluation_id).glob("*.json"))


def require_generation_coverage(sources):
    expected = {path.relative_to(ROOT).as_posix() for suite in SUITES
                for path in (ROOT / "benches" / suite / "generations" / GENERATION).glob("*.json")}
    missing, extra = expected - sources, sources - expected
    if not expected or missing or extra:
        raise ValueError(f"Evaluation must cover the complete retained generation batch: {len(missing)} missing, {len(extra)} unexpected sources")


ARENA_OUT = ROOT / "visualizer/data/arena.json"


def command_arena_build(args):
    payload = {
        "benchmark": "LiteBench Arena",
        "generation": args.generation,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "suites": {},
    }
    configs = 0
    for suite, name in SUITES.items():
        _, tasks = load_tasks(ROOT / "benches" / suite / "public.json")
        suite_payload = {
            "name": name,
            "tasks": [{key: task.get(key, "") for key in ("id", "title", "prompt")} for task in tasks],
            "configs": [],
        }
        for path in sorted((ROOT / "benches" / suite / "generations" / args.generation).glob("*.json")):
            data, _ = load_generation(path, suite)
            batch = data["batch"]
            outputs = {item["task_id"]: item["output"] for item in data["items"]}
            suite_payload["configs"].append({
                "config": f"{batch['model']} [{batch['reasoning_effort']}]",
                "model": batch["model"],
                "reasoning_effort": batch["reasoning_effort"],
                "generation_file": path.relative_to(ROOT).as_posix(),
                "items": [{"task_id": task["id"], "output": outputs[task["id"]]} for task in tasks],
            })
            configs += 1
        if not suite_payload["configs"]:
            raise ValueError(f"No generation files found for {suite}/{args.generation}")
        payload["suites"][suite] = suite_payload
    write_json(args.out, payload)
    print(f"{args.out}: wrote {configs} arena configurations from {args.generation}")
    return 0


def command_arena_check(args):
    data = read_json(args.arena)
    if not isinstance(data, dict) or data.get("generation") != args.generation:
        raise ValueError(f"{args.arena}: expected arena data for generation {args.generation}")
    suites = data.get("suites")
    if not isinstance(suites, dict) or set(suites) != set(SUITES):
        raise ValueError(f"{args.arena}: expected suites {sorted(SUITES)}")
    valid = True
    for suite, name in SUITES.items():
        try:
            _, tasks = load_tasks(ROOT / "benches" / suite / "public.json")
            entry = suites[suite]
            if [task["id"] for task in entry.get("tasks", [])] != [task["id"] for task in tasks]:
                raise ValueError("arena task list does not match public tasks")
            if any(task.get("prompt") != public.get("prompt") for task, public in zip(entry["tasks"], tasks)):
                raise ValueError("arena prompt text does not match public tasks")
            seen = set()
            for config in entry.get("configs", []):
                source = ROOT / config.get("generation_file", "")
                generation, _ = load_generation(source, suite)
                if config.get("config") in seen:
                    raise ValueError(f"duplicate arena config {config.get('config')}")
                seen.add(config["config"])
                original = {item["task_id"]: item["output"] for item in generation["items"]}
                listed = {item["task_id"]: item["output"] for item in config.get("items", [])}
                if listed != original:
                    raise ValueError(f"{config.get('config')}: arena texts do not match the generation file")
            print(f"{suite}: OK, {len(entry['configs'])} configurations over {len(tasks)} prompts")
        except (ValueError, OSError, AttributeError, KeyError, TypeError) as exc:
            print(f"{suite}: {exc}", file=sys.stderr)
            valid = False
    return 0 if valid else 1


def command_prompts(args):
    data, tasks = load_tasks(args.tasks)
    print(f"LiteBench / {task_set_name(data)} / {len(tasks)} prompts")
    for task in tasks:
        print(f"\n{task['id']} / {task.get('title', '')}\n{task['prompt']}")
    return 0


def command_check(args):
    paths = [Path(path).resolve() for path in args.paths] or sorted(ROOT.glob(f"benches/*/generations/{GENERATION}/*.json"))
    valid = True
    for path in paths:
        try:
            parts = path.relative_to(ROOT).parts
            if len(parts) != 5 or parts[1] not in SUITES:
                raise ValueError("expected a public generation file")
            data, _ = load_generation(path, parts[1])
            print(f"{path.relative_to(ROOT)}: OK, {len(data['items'])} preserved outputs")
        except ValueError as exc:
            print(f"{path}: {exc}", file=sys.stderr)
            valid = False
    return 0 if paths and valid else 1


def command_evaluation_check(args):
    paths = [Path(path) for path in args.paths] or evaluation_paths(args.evaluation)
    valid = True
    for path in paths:
        try:
            _, data, _, _, _ = load_evaluation(path)
            print(f"{path}: OK, {len(data['items'])} Astra xhigh annotations")
        except ValueError as exc:
            print(f"{path}: {exc}", file=sys.stderr)
            valid = False
    if not paths:
        print("No evaluation files found.", file=sys.stderr)
    return 0 if paths and valid else 1


def command_build(args):
    from judge import estimated_cost

    paths = evaluation_paths(args.evaluation)
    if not paths:
        raise ValueError(f"No evaluations found for {args.evaluation}")
    protocol, pricing = read_json(ROOT / PROTOCOL), read_json(PRICING)
    payload = {
        "benchmark": "LiteBench", "personal": True, "owner": "Kyle", "demonstration": True, "score_scale": 100,
        "evaluation": {"id": args.evaluation, "type": "ai_personal_proxy", "judge": protocol["judge"],
                       "protocol_file": PROTOCOL, "protocol_version": protocol["version"], "score_scale": 5,
                       "display_scale": 100, "purpose": "demonstration", "human_validated": False, "unslop_file": UNSLOP},
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(), "pricing": pricing, "suites": {},
    }
    for suite, name in SUITES.items():
        _, tasks = load_tasks(ROOT / "benches" / suite / "public.json")
        rubric = protocol["suites"][suite]
        payload["suites"][suite] = {
            "name": name, "score_label": rubric["label"], "question": rubric["question"], "criteria": rubric["criteria"],
            "task_count": len(tasks), "tasks": [{key: task.get(key, "") for key in ("id", "title", "prompt")} for task in tasks], "runs": [],
        }
    seen, attempt_costs = set(), []
    for path in paths:
        suite, data, generation, _, joined = load_evaluation(path)
        source_file = data["evaluation"]["source_file"]
        if source_file in seen:
            raise ValueError(f"Duplicate evaluation source: {source_file}")
        seen.add(source_file)
        attempt_costs.extend(estimated_cost(attempt.get("usage"), protocol["pricing"])
                             for item in data["items"] for attempt in item["attempts"])
        row = generation_summary(generation, pricing)
        row.update(score=round(fmean(item["score"] for item in joined), 2),
                   brief_ok_pct=round(100 * fmean(item["judgment"]["brief_ok"] for item in joined), 2),
                   rated=len(joined), file=path.relative_to(ROOT).as_posix(), generation_file=source_file, items=joined)
        payload["suites"][suite]["runs"].append(row)
    require_generation_coverage(seen)
    for suite in payload["suites"].values():
        suite["runs"].sort(key=lambda row: (-row["score"], row["model"], row["reasoning_effort"]))
    known_costs = [cost for cost in attempt_costs if numeric(cost)]
    payload["evaluation"]["cost"] = {
        "known_estimate_usd": round(sum(known_costs), 6),
        "attempt_count": len(attempt_costs),
        "unknown_cost_attempts": len(attempt_costs) - len(known_costs),
        "basis": "evaluation attempts, separate from candidate generation; not a reconciled bill",
        "pricing": protocol.get("pricing"),
    }
    write_json(args.out, payload)
    print(f"{args.out}: wrote {len(paths)} demonstration configurations")
    return 0


def command_self_test(_args):
    from io import BytesIO
    from judge import estimated_cost, extract_text, parse_response_stream, validate_judgment

    protocol = read_json(ROOT / PROTOCOL)
    judgment = {
        "criteria": {key: {"score": 4, "reason": "Specific and clear."} for key in protocol["suites"]["copybench"]["criteria"]},
        "score_5": 4, "score": 80, "brief_ok": True, "realized_cefr": None,
        "issues": [{"code": "stock_phrase", "category": "slop", "severity": "minor", "evidence": "vibrant", "explanation": "Promotional filler."}],
        "note": "Some wording needs editing.",
    }
    assert not validate_judgment(judgment, "copybench", "A vibrant lunchbox.", protocol)
    for change in ("evidence", "score"):
        bad = copy.deepcopy(judgment)
        if change == "evidence":
            bad["issues"][0]["evidence"] = "not in the output"
        else:
            bad["score"] = 81
        assert validate_judgment(bad, "copybench", "A vibrant lunchbox.", protocol)
    for operation in (lambda: require_hash(ROOT / PROTOCOL, "0" * 64),
                      lambda: indexed_items([{"task_id": "one"}, {"task_id": "one"}]),
                      lambda: load_generation(ROOT / "private/hidden.json", "copybench")):
        try:
            operation()
        except ValueError:
            pass
        else:
            raise AssertionError("invalid data accepted")
    malformed = copy.deepcopy(judgment)
    malformed["issues"][0]["category"] = []
    assert validate_judgment(malformed, "copybench", "A vibrant lunchbox.", protocol)
    try:
        extract_text({"output": [{"type": "message", "content": None}]})
    except ValueError:
        pass
    else:
        raise AssertionError("malformed API output accepted")
    assert estimated_cost({"input_tokens": 1000, "output_tokens": 1000, "output_tokens_details": {"reasoning_tokens": 500}}, protocol["pricing"]) == 0.06
    assert estimated_cost({"input_tokens": 1000, "output_tokens": 1000, "input_tokens_details": []}, protocol["pricing"]) is None
    for status in ("completed", "incomplete", "failed"):
        response = {"status": status, "model": "gpt-6-astra", "usage": {"input_tokens": 1000, "output_tokens": 1000}}
        frame = f': keepalive\r\nevent: response.{status}\r\ndata: {{"type":"response.{status}",\r\ndata: "response":{json.dumps(response)}}}\r\n\r\n'
        assert parse_response_stream(BytesIO(frame.encode())) == response
    for stream in (b'', b'data: [DONE]\n\n', b'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
                   b'data: {"type":"response.completed","response":null}\n\n', b'data: []\n\n',
                   b'data: {"type":"error"}\n\n', b'data: invalid\n\n'):
        try:
            parse_response_stream(BytesIO(stream))
        except ValueError:
            pass
        else:
            raise AssertionError("invalid or unterminated Responses stream accepted")
    sources = {path.relative_to(ROOT).as_posix() for path in ROOT.glob(f"benches/*/generations/{GENERATION}/*.json")}
    require_generation_coverage(sources)
    for incomplete in (set(), sources - {next(iter(sources))}, sources | {"unexpected.json"}):
        try:
            require_generation_coverage(incomplete)
        except ValueError:
            pass
        else:
            raise AssertionError("incomplete or extra generation coverage accepted")
    print("self-test: OK, evidence, derived score, hash, duplicate, private-source, SSE and batch coverage checks")
    return 0


def parser():
    cli = argparse.ArgumentParser(description=__doc__)
    commands = cli.add_subparsers(dest="command", required=True)
    prompts = commands.add_parser("prompts", help="print a task set")
    prompts.add_argument("--tasks", default=PUBLIC_TASKS, type=Path)
    prompts.set_defaults(func=command_prompts)
    check = commands.add_parser("check", help="validate preserved public generations")
    check.add_argument("paths", nargs="*")
    check.set_defaults(func=command_check)
    for name in ("evaluation-check", "panel-check"):
        check = commands.add_parser(name, help="validate current Astra evaluations")
        check.add_argument("paths", nargs="*")
        check.add_argument("--evaluation", default=EVALUATION)
        check.set_defaults(func=command_evaluation_check)
    build = commands.add_parser("build", help="rebuild personal demonstration results")
    build.add_argument("--evaluation", default=EVALUATION)
    build.add_argument("--out", default=LEADERBOARD, type=Path)
    build.set_defaults(func=command_build)
    arena_build = commands.add_parser("arena-build", help="build human-vote arena data from generations only")
    arena_build.add_argument("--generation", default=GENERATION)
    arena_build.add_argument("--out", default=ARENA_OUT, type=Path)
    arena_build.set_defaults(func=command_arena_build)
    arena_check = commands.add_parser("arena-check", help="verify arena data matches generation files")
    arena_check.add_argument("--generation", default=GENERATION)
    arena_check.add_argument("--arena", default=ARENA_OUT, type=Path)
    arena_check.set_defaults(func=command_arena_check)
    commands.add_parser("self-test", help="run offline validation checks").set_defaults(func=command_self_test)
    return cli


def main():
    args = parser().parse_args()
    try:
        return args.func(args)
    except (ValueError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
