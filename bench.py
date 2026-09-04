#!/usr/bin/env python3
"""Small, dependency-free helper for CopyBench Lite."""

import argparse
import json
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from statistics import fmean


ROOT = Path(__file__).resolve().parent
PUBLIC_TASKS = ROOT / "data" / "public.json"
RESULTS_DIR = ROOT / "results"
LEADERBOARD = ROOT / "docs" / "leaderboard.json"
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
    return summary


def command_prompts(args):
    data, tasks = load_tasks(args.tasks)
    print(f"CopyBench Lite - {task_set_name(data)} - {len(tasks)} tasks")
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


def command_build(args):
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
            summary["file"] = path.name
            rows.append(summary)
    if not valid:
        return 1
    payload = {
        "benchmark": "CopyBench Lite",
        "task_set": expected_name,
        "score_scale": 100,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "runs": rows,
    }
    write_json(args.out, payload)
    print(f"{args.out}: wrote {len(rows)} run(s)")
    return 0


def command_self_test(_args):
    task_data, tasks = load_tasks(PUBLIC_TASKS)
    assert task_set_name(task_data) == "public-0.1"
    assert len(tasks) == 8
    sample = {
        "run": {
            "model": "test",
            "task_set": "test-0",
            "reasoning_effort": "high",
            "evaluation_type": "ai_provisional",
            "human_evaluation": False,
        },
        "items": [
            {
                "task_id": "one",
                "output": "x",
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

    build = commands.add_parser("build", help="rebuild static leaderboard data")
    build.add_argument("--results", default=RESULTS_DIR, type=Path)
    build.add_argument("--out", default=LEADERBOARD, type=Path)
    build.set_defaults(func=command_build)

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
