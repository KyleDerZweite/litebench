#!/usr/bin/env python3
"""Validate and aggregate LiteBench result files."""

import argparse
import hashlib
import json
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from statistics import fmean


ROOT = Path(__file__).resolve().parent
PUBLIC_TASKS = ROOT / "benches" / "copybench" / "public.json"
RESULTS_DIR = ROOT / "benches" / "copybench" / "results"
LEADERBOARD = ROOT / "visualizer" / "data" / "leaderboard.json"
PRICING = ROOT / "pricing.json"
PANEL_EVALUATION = "2026-09-04-panel-v0.1"
PANEL_SUITES = {
    "copybench": ("CopyBench Lite", "CopyBench score"),
    "naturalbench": ("NaturalBench Lite", "Naturalness score"),
    "cefrbench": ("CEFRBench Lite", "CEFR fit score"),
}
DETAIL_GENERATION_FIELDS = ("input_tokens", "output_tokens", "total_tokens", "latency_ms")
DETAIL_JUDGMENT_FIELDS = ("score", "brief_ok", "realized_cefr", "issues", "note")
SCALE_FIELDS = ("copy_quality", "naturalness", "cefr_fit")
BOOL_FIELDS = ("facts_ok", "would_use")


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Cannot read {path}: {exc}") from exc


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_tasks(path):
    data = read_json(path)
    tasks = data.get("tasks") if isinstance(data, dict) else None
    if not isinstance(tasks, list) or not tasks:
        raise ValueError(f"{path}: expected a non-empty 'tasks' list")
    ids = [task.get("id") for task in tasks if isinstance(task, dict)]
    if len(ids) != len(tasks) or any(not item_id for item_id in ids):
        raise ValueError(f"{path}: every task needs an id")
    if len(ids) != len(set(ids)):
        raise ValueError(f"{path}: duplicate task id")
    return data, tasks


def task_set_name(data):
    return f"{data.get('name', 'tasks')}-{data.get('version', 'unknown')}"


def slug(text):
    value = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return value or "model"


def blank_scores():
    return {field: None for field in SCALE_FIELDS + BOOL_FIELDS}


def validation_errors(data):
    errors = []
    if not isinstance(data, dict):
        return ["root must be a JSON object"]
    if data.get("schema_version") not in (None, 1):
        errors.append("schema_version must be 1")
    run = data.get("run")
    if not isinstance(run, dict) or not str(run.get("model", "")).strip():
        errors.append("run.model must be a non-empty string")
    elif not str(run.get("task_set", "")).strip():
        errors.append("run.task_set must be a non-empty string")
    items = data.get("items")
    if not isinstance(items, list) or not items:
        errors.append("items must be a non-empty list")
        return errors

    seen = set()
    for index, item in enumerate(items, 1):
        label = f"items[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{label} must be an object")
            continue
        task_id = item.get("task_id")
        if not isinstance(task_id, str) or not task_id:
            errors.append(f"{label}.task_id must be a non-empty string")
        elif task_id in seen:
            errors.append(f"{label}.task_id is duplicated: {task_id}")
        else:
            seen.add(task_id)
        if not isinstance(item.get("output", ""), str):
            errors.append(f"{label}.output must be a string")
        scores = item.get("scores")
        if not isinstance(scores, dict):
            errors.append(f"{label}.scores must be an object")
            continue
        for field in SCALE_FIELDS:
            value = scores.get(field)
            if value is not None and (type(value) is not int or not 1 <= value <= 5):
                errors.append(f"{label}.scores.{field} must be null or an integer from 1 to 5")
        for field in BOOL_FIELDS:
            value = scores.get(field)
            if value is not None and type(value) is not bool:
                errors.append(f"{label}.scores.{field} must be null, true, or false")
    return errors


def task_coverage_errors(data, expected_name, expected_ids):
    errors = []
    run = data.get("run", {})
    if run.get("task_set") != expected_name:
        errors.append(f"run.task_set must be {expected_name!r}")
    actual = {item.get("task_id") for item in data.get("items", []) if isinstance(item, dict)}
    missing = sorted(expected_ids - actual)
    extra = sorted(actual - expected_ids)
    if missing:
        errors.append(f"missing task ids: {', '.join(missing)}")
    if extra:
        errors.append(f"unknown task ids: {', '.join(extra)}")
    return errors


def is_rated(item):
    scores = item.get("scores", {})
    return bool(item.get("output", "").strip()) and all(
        scores.get(field) is not None for field in SCALE_FIELDS + BOOL_FIELDS
    )


def aggregate(data):
    items = data["items"]
    generated = [item for item in items if item.get("output", "").strip()]
    rated = [item for item in items if is_rated(item)]
    if not generated:
        return None
    run = data["run"]
    summary = {
        "model": run["model"],
        "provider": run.get("provider", ""),
        "model_version": run.get("model_version", ""),
        "reasoning_effort": run.get("reasoning_effort", ""),
        "date": run.get("date", ""),
        "evaluator": run.get("evaluator", ""),
        "evaluation_type": run.get("evaluation_type", ""),
        "human_evaluation": bool(run.get("human_evaluation", False)),
        "generated": len(generated),
        "rated": len(rated),
        "total": len(items),
        "status": (
            "human_scored" if len(rated) == len(items) and run.get("human_evaluation")
            else "ai_scored" if len(rated) == len(items) and run.get("evaluation_type") == "ai_provisional"
            else "partially_scored" if rated else "unrated"
        ),
    }
    for field in SCALE_FIELDS:
        summary[field] = round(20 * fmean(item["scores"][field] for item in rated), 1) if rated else None
    for field in BOOL_FIELDS:
        summary[f"{field}_pct"] = (
            round(100 * fmean(item["scores"][field] for item in rated), 1)
            if rated else None
        )
    generations = [item.get("generation") for item in generated]
    for field in ("latency_ms", "input_tokens", "output_tokens", "total_tokens"):
        values = [entry.get(field) for entry in generations if isinstance(entry, dict)]
        summary[f"average_{field}"] = (
            round(fmean(values))
            if len(values) == len(generated) and all(type(value) in (int, float) for value in values)
            else None
        )
    costs = [entry.get("cost_usd") for entry in generations if isinstance(entry, dict)]
    if len(costs) == len(generated) and all(type(value) in (int, float) for value in costs):
        summary["average_cost_usd"] = round(fmean(costs), 6)
        summary["cost_basis"] = "reported"
    else:
        pricing = read_json(PRICING)
        rates = pricing.get("models", {}).get(run["model"])
        token_pairs = [
            (
                entry.get("input_tokens"),
                entry.get("total_tokens") - entry.get("input_tokens")
                if type(entry.get("total_tokens")) in (int, float)
                and type(entry.get("input_tokens")) in (int, float)
                else entry.get("output_tokens"),
            )
            for entry in generations
            if isinstance(entry, dict)
        ]
        if rates and len(token_pairs) == len(generated) and all(
            type(input_tokens) in (int, float) and type(output_tokens) in (int, float)
            for input_tokens, output_tokens in token_pairs
        ):
            estimates = [
                (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1_000_000
                for input_tokens, output_tokens in token_pairs
            ]
            summary["average_cost_usd"] = round(fmean(estimates), 6)
            summary["cost_basis"] = "estimated"
        else:
            summary["average_cost_usd"] = None
            summary["cost_basis"] = "unavailable"
    return summary


def command_prompts(args):
    data, tasks = load_tasks(args.tasks)
    print(f"LiteBench / CopyBench Lite - {task_set_name(data)} - {len(tasks)} tasks")
    for index, task in enumerate(tasks, 1):
        print(f"\n[{index}/{len(tasks)}] {task['id']} - {task.get('title', '')}")
        print(task["prompt"])
    return 0


def command_new(args):
    task_data, tasks = load_tasks(args.tasks)
    output = Path(args.out) if args.out else RESULTS_DIR / f"{slug(args.model)}-{args.date}.json"
    if output.exists():
        raise ValueError(f"Refusing to overwrite existing file: {output}")
    result = {
        "schema_version": 1,
        "run": {
            "model": args.model,
            "provider": args.provider,
            "model_version": "",
            "date": args.date,
            "task_set": task_set_name(task_data),
            "temperature": None,
            "system_prompt": "",
            "evaluator": "",
        },
        "items": [
            {
                "task_id": task["id"],
                "output": "",
                "scores": blank_scores(),
                "notes": "",
            }
            for task in tasks
        ],
    }
    write_json(output, result)
    print(output)
    return 0


def check_file(path):
    data = read_json(path)
    errors = validation_errors(data)
    if not errors:
        for task_path in (PUBLIC_TASKS, ROOT / "private" / "hidden.json"):
            if not task_path.exists():
                continue
            task_data, tasks = load_tasks(task_path)
            name = task_set_name(task_data)
            if data["run"].get("task_set") == name:
                ids = {task["id"] for task in tasks}
                errors.extend(task_coverage_errors(data, name, ids))
                break
    if errors:
        for error in errors:
            print(f"{path}: {error}", file=sys.stderr)
        return False
    summary = aggregate(data)
    if summary and summary["rated"]:
        rating_label = (
            "human" if summary["human_evaluation"]
            else "AI provisional" if summary["evaluation_type"] == "ai_provisional"
            else "self-reported"
        )
        print(
            f"{path}: OK - {summary['generated']}/{summary['total']} generated, "
            f"{summary['rated']}/{summary['total']} {rating_label}-rated; "
            f"copy {summary['copy_quality']}/100; natural {summary['naturalness']}/100; "
            f"CEFR {summary['cefr_fit']}/100; facts {summary['facts_ok_pct']}/100; "
            f"would use {summary['would_use_pct']}/100"
        )
    elif summary:
        print(
            f"{path}: OK raw run - {summary['generated']}/{summary['total']} generated, "
            "0 rated; excluded from rankings"
        )
    else:
        print(f"{path}: OK draft - 0/{len(data['items'])} rated")
    return True


def command_check(args):
    paths = [Path(path) for path in args.paths]
    if not paths:
        paths = sorted(RESULTS_DIR.glob("*.json"))
    if not paths:
        print("No result JSON files found.")
        return 0
    valid = True
    for path in paths:
        valid = check_file(path) and valid
    return 0 if valid else 1


def command_legacy_build(args):
    result_dir = Path(args.results)
    task_data, tasks = load_tasks(PUBLIC_TASKS)
    expected_name = task_set_name(task_data)
    expected_ids = {task["id"] for task in tasks}
    rows = []
    valid = True
    for path in sorted(result_dir.glob("*.json")):
        data = read_json(path)
        errors = validation_errors(data)
        if not errors:
            errors.extend(task_coverage_errors(data, expected_name, expected_ids))
        if errors:
            valid = False
            for error in errors:
                print(f"{path}: {error}", file=sys.stderr)
            continue
        summary = aggregate(data)
        if summary:
            resolved = path.resolve()
            summary["file"] = resolved.relative_to(ROOT).as_posix() if resolved.is_relative_to(ROOT) else path.name
            rows.append(summary)
    if not valid:
        return 1
    payload = {
        "benchmark": "LiteBench",
        "suite": "CopyBench Lite",
        "task_set": expected_name,
        "score_scale": 100,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "pricing": read_json(PRICING),
        "runs": rows,
    }
    write_json(args.out, payload)
    print(f"{args.out}: wrote {len(rows)} run(s)")
    return 0


def panel_validation_errors(data):
    errors = []
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        return ["schema_version must be 1"]
    evaluation = data.get("evaluation")
    summary = data.get("summary")
    items = data.get("items")
    if not isinstance(evaluation, dict):
        errors.append("evaluation must be an object")
        return errors
    if not isinstance(summary, dict) or not str(summary.get("model", "")).strip():
        errors.append("summary.model must be a non-empty string")
    if not isinstance(items, list) or not items:
        errors.append("items must be a non-empty list")
        return errors
    judges = evaluation.get("judges")
    judge_ids = set(judges) if isinstance(judges, dict) else set()
    if len(judge_ids) != 3:
        errors.append("evaluation.judges must contain three judges")
    seen = set()
    for index, item in enumerate(items, 1):
        label = f"items[{index}]"
        task_id = item.get("task_id") if isinstance(item, dict) else None
        if not isinstance(task_id, str) or not task_id or task_id in seen:
            errors.append(f"{label}.task_id must be unique and non-empty")
        else:
            seen.add(task_id)
        score = item.get("score") if isinstance(item, dict) else None
        judgments = item.get("judgments") if isinstance(item, dict) else None
        if isinstance(score, bool) or not isinstance(score, (int, float)) or not 0 <= score <= 100:
            errors.append(f"{label}.score must be numeric from 0 to 100")
        if not isinstance(judgments, dict) or set(judgments) != judge_ids:
            errors.append(f"{label}.judgments must match the panel")
            continue
        scores = [judgment.get("score") for judgment in judgments.values() if isinstance(judgment, dict)]
        if len(scores) != 3 or any(
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not 0 <= value <= 100
            for value in scores
        ):
            errors.append(f"{label} has invalid judge scores")
        elif round(fmean(scores), 2) != score:
            errors.append(f"{label}.score does not match the judge mean")
    return errors


def panel_paths(evaluation_id):
    return sorted(ROOT.glob(f"benches/*/evaluations/{evaluation_id}/*.json"))


def run_detail_items(path, data, tasks):
    """Join one panel evaluation to its generation records for the static site."""
    expected_ids = {task["id"] for task in tasks}
    evaluation_items = data.get("items", [])
    evaluation_by_id = {item["task_id"]: item for item in evaluation_items}
    if set(evaluation_by_id) != expected_ids:
        missing = sorted(expected_ids - set(evaluation_by_id))
        extra = sorted(set(evaluation_by_id) - expected_ids)
        details = []
        if missing:
            details.append(f"missing {', '.join(missing)}")
        if extra:
            details.append(f"unknown {', '.join(extra)}")
        raise ValueError(f"{path}: evaluation task ids do not match task set ({'; '.join(details)})")

    source_file = data.get("evaluation", {}).get("source_file")
    if not isinstance(source_file, str) or not source_file:
        raise ValueError(f"{path}: evaluation.source_file is required")
    source_path = (ROOT / source_file).resolve()
    if not source_path.is_relative_to(ROOT) or not source_path.exists():
        raise ValueError(f"{path}: evaluation.source_file is missing or outside the repository")
    generation_data = read_json(source_path)
    generation_items = generation_data.get("items") if isinstance(generation_data, dict) else None
    if not isinstance(generation_items, list):
        raise ValueError(f"{source_path}: expected an items list")
    generation_by_id = {}
    for item in generation_items:
        task_id = item.get("task_id") if isinstance(item, dict) else None
        if not isinstance(task_id, str) or not task_id:
            raise ValueError(f"{source_path}: every generation item needs a task_id")
        if task_id in generation_by_id:
            raise ValueError(f"{source_path}: duplicate task id {task_id}")
        generation_by_id[task_id] = item
    if set(generation_by_id) != expected_ids:
        missing = sorted(expected_ids - set(generation_by_id))
        extra = sorted(set(generation_by_id) - expected_ids)
        details = []
        if missing:
            details.append(f"missing {', '.join(missing)}")
        if extra:
            details.append(f"unknown {', '.join(extra)}")
        raise ValueError(f"{source_path}: generation task ids do not match task set ({'; '.join(details)})")

    joined = []
    for task in tasks:
        task_id = task["id"]
        generated = generation_by_id[task_id]
        output = generated.get("output")
        if not isinstance(output, str):
            raise ValueError(f"{source_path}: {task_id}.output must be a string")
        generation = generated.get("generation")
        if not isinstance(generation, dict):
            generation = {}
        generation_detail = {field: generation.get(field) for field in DETAIL_GENERATION_FIELDS}
        evaluation_item = evaluation_by_id[task_id]
        judgments = {}
        for judge_id, judgment in evaluation_item["judgments"].items():
            if not isinstance(judgment, dict):
                raise ValueError(f"{path}: {task_id}.{judge_id} must be an object")
            issues = judgment.get("issues", [])
            if not isinstance(issues, list):
                raise ValueError(f"{path}: {task_id}.{judge_id}.issues must be a list")
            parsed_issues = []
            for issue in issues:
                if not isinstance(issue, dict):
                    raise ValueError(f"{path}: {task_id}.{judge_id}.issues must contain objects")
                parsed_issues.append({"code": issue.get("code", ""), "evidence": issue.get("evidence", "")})
            judgments[judge_id] = {
                field: (parsed_issues if field == "issues" else judgment.get(field))
                for field in DETAIL_JUDGMENT_FIELDS
            }
        joined.append({
            "task_id": task_id,
            "output": output,
            "generation": generation_detail,
            "score": evaluation_item["score"],
            "judge_stddev": evaluation_item["judge_stddev"],
            "brief_ok_votes": evaluation_item["brief_ok_votes"],
            "judgments": judgments,
        })
    return joined


def command_panel_check(args):
    paths = [Path(path) for path in args.paths] or panel_paths(args.evaluation)
    if not paths:
        print("No panel evaluation files found.")
        return 1
    valid = True
    for path in paths:
        data = read_json(path)
        errors = panel_validation_errors(data)
        evaluation = data.get("evaluation", {}) if isinstance(data, dict) else {}
        for field in ("protocol_file", "source_file"):
            relative = evaluation.get(field)
            if not isinstance(relative, str):
                errors.append(f"evaluation.{field} must be a string")
                continue
            target = (ROOT / relative).resolve()
            if not target.is_relative_to(ROOT) or not target.exists():
                errors.append(f"evaluation.{field} is missing or outside the repository")
                continue
            expected = evaluation.get(field.replace("_file", "_sha256"))
            actual = hashlib.sha256(target.read_bytes()).hexdigest()
            if expected != actual:
                errors.append(f"evaluation.{field} hash does not match")
        if errors:
            valid = False
            for error in errors:
                print(f"{path}: {error}", file=sys.stderr)
        else:
            print(f"{path}: OK - {len(data['items'])} outputs, three judges")
    return 0 if valid else 1


def command_build(args):
    paths = panel_paths(args.evaluation)
    if not paths:
        raise ValueError(f"No panel evaluations found for {args.evaluation}")
    rows = {suite: [] for suite in PANEL_SUITES}
    suite_tasks = {
        suite: load_tasks(ROOT / "benches" / suite / "public.json")[1]
        for suite in PANEL_SUITES
    }
    panel = None
    valid = True
    for path in paths:
        data = read_json(path)
        errors = panel_validation_errors(data)
        if errors:
            valid = False
            for error in errors:
                print(f"{path}: {error}", file=sys.stderr)
            continue
        evaluation = data["evaluation"]
        if panel is None:
            panel = evaluation
        elif evaluation["protocol_sha256"] != panel["protocol_sha256"]:
            valid = False
            print(f"{path}: evaluator protocol does not match the other runs", file=sys.stderr)
            continue
        source_file = evaluation.get("source_file")
        source_parts = Path(source_file).parts if isinstance(source_file, str) else ()
        suite = source_parts[1] if len(source_parts) > 1 and source_parts[0] == "benches" else ""
        if suite not in rows:
            valid = False
            print(f"{path}: unknown suite {suite}", file=sys.stderr)
            continue
        summary = dict(data["summary"])
        summary["file"] = path.relative_to(ROOT).as_posix()
        summary["items"] = run_detail_items(path, data, suite_tasks[suite])
        rows[suite].append(summary)
    if not valid:
        return 1
    payload = {
        "benchmark": "LiteBench",
        "score_scale": 100,
        "evaluation": {
            "id": args.evaluation,
            "type": "ai_panel_provisional",
            "protocol_version": panel["protocol_version"],
            "human_validated": False,
            "judges": panel["judges"],
        },
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "pricing": read_json(PRICING),
        "suites": {},
    }
    for suite, suite_rows in rows.items():
        name, score_label = PANEL_SUITES[suite]
        payload["suites"][suite] = {
            "name": name,
            "score_label": score_label,
            "task_count": len(suite_tasks[suite]),
            "tasks": [
                {"id": task["id"], "title": task.get("title", ""), "prompt": task["prompt"]}
                for task in suite_tasks[suite]
            ],
            "runs": sorted(
                suite_rows,
                key=lambda row: (-row["score"], row["model"], row["reasoning_effort"]),
            ),
        }
    write_json(args.out, payload)
    print(f"{args.out}: wrote {sum(len(value) for value in rows.values())} panel run(s)")
    return 0


def command_self_test(_args):
    task_data, tasks = load_tasks(PUBLIC_TASKS)
    assert task_set_name(task_data) == "public-0.1"
    assert len(tasks) == 8
    sample = {
        "run": {
            "model": "gpt-5.6-luna",
            "task_set": "test-0",
            "reasoning_effort": "high",
            "evaluation_type": "ai_provisional",
            "human_evaluation": False,
        },
        "items": [
            {
                "task_id": "one",
                "output": "x",
                "generation": {"latency_ms": 1000, "input_tokens": 100, "output_tokens": 200, "total_tokens": 300},
                "scores": {
                    "copy_quality": 3,
                    "naturalness": 4,
                    "cefr_fit": 5,
                    "facts_ok": True,
                    "would_use": False,
                },
            },
            {
                "task_id": "two",
                "output": "y",
                "generation": {"latency_ms": 3000, "input_tokens": 200, "output_tokens": 400, "total_tokens": 600},
                "scores": {
                    "copy_quality": 5,
                    "naturalness": 2,
                    "cefr_fit": 3,
                    "facts_ok": False,
                    "would_use": True,
                },
            },
        ],
    }
    assert not validation_errors(sample)
    summary = aggregate(sample)
    assert summary["generated"] == 2
    assert summary["copy_quality"] == 80
    assert summary["facts_ok_pct"] == 50
    assert summary["reasoning_effort"] == "high"
    assert summary["status"] == "ai_scored"
    assert summary["average_latency_ms"] == 2000
    assert summary["average_output_tokens"] == 300
    assert summary["average_cost_usd"] == 0.00039
    assert summary["cost_basis"] == "estimated"
    panel_sample = {
        "schema_version": 1,
        "evaluation": {"judges": {"one": {}, "two": {}, "three": {}}},
        "summary": {"model": "sample"},
        "items": [
            {
                "task_id": "sample-task",
                "score": 80.0,
                "judgments": {
                    "one": {"score": 70.0},
                    "two": {"score": 80.0},
                    "three": {"score": 90.0},
                },
            }
        ],
    }
    assert not panel_validation_errors(panel_sample)
    panel_sample["items"][0]["score"] = 81.0
    assert panel_validation_errors(panel_sample)
    panel_sample["items"][0]["score"] = 80.0
    panel_sample["items"][0]["judgments"]["one"]["score"] = 101.0
    panel_sample["items"][0]["judgments"]["three"]["score"] = 59.0
    assert panel_validation_errors(panel_sample)
    print("self-test: OK")
    return 0


def parser():
    cli = argparse.ArgumentParser(description=__doc__)
    commands = cli.add_subparsers(dest="command", required=True)

    prompts = commands.add_parser("prompts", help="print a task set")
    prompts.add_argument("--tasks", default=PUBLIC_TASKS, type=Path)
    prompts.set_defaults(func=command_prompts)

    new = commands.add_parser("new", help="create an empty result file")
    new.add_argument("model")
    new.add_argument("--provider", default="")
    new.add_argument("--date", default=date.today().isoformat())
    new.add_argument("--tasks", default=PUBLIC_TASKS, type=Path)
    new.add_argument("--out", type=Path)
    new.set_defaults(func=command_new)

    check = commands.add_parser("check", help="validate and summarize result files")
    check.add_argument("paths", nargs="*")
    check.set_defaults(func=command_check)

    panel_check = commands.add_parser("panel-check", help="validate panel evaluation files")
    panel_check.add_argument("paths", nargs="*")
    panel_check.add_argument("--evaluation", default=PANEL_EVALUATION)
    panel_check.set_defaults(func=command_panel_check)

    build = commands.add_parser("build", help="rebuild static panel leaderboard data")
    build.add_argument("--evaluation", default=PANEL_EVALUATION)
    build.add_argument("--out", default=LEADERBOARD, type=Path)
    build.set_defaults(func=command_build)

    legacy_build = commands.add_parser("legacy-build", help="rebuild the earlier CopyBench leaderboard")
    legacy_build.add_argument("--results", default=RESULTS_DIR, type=Path)
    legacy_build.add_argument("--out", default=LEADERBOARD, type=Path)
    legacy_build.set_defaults(func=command_legacy_build)

    self_test = commands.add_parser("self-test", help="run the smallest useful check")
    self_test.set_defaults(func=command_self_test)
    return cli


def main():
    args = parser().parse_args()
    try:
        return args.func(args)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
