# CopyBench Lite

A tiny, bilingual copywriting smoke test for choosing models you would actually
use. It is a personal decision aid first and a community dataset second—not a
scientific claim about the "best" writing model.

Live dashboard: <https://kylederzweite.github.io/copybench-lite/>

> **Current limitation:** A generated run can be published before human review,
> but it is labelled **unrated** and excluded from every metric ranking. Raw AI
> output is evidence of a run, not evidence of quality.

V0 deliberately contains only:

- 8 public writing tasks: 4 localized DE/EN pairs across A2, B1, B2, and C1
- 1 output per task and model
- 3 separate 1–5 ratings plus 2 practical yes/no checks
- raw outputs and run metadata in reviewable JSON files
- a dependency-free Python helper and a static GitHub Pages site
- a small, local-only hidden canary set

No speech, AI detector, trained scorer, paid rater panel, database, web app, or
single magic score. The reasoning is in [DESIGN.md](DESIGN.md).

## What it measures

| Field | Question |
|---|---|
| `copy_quality` | Is the copy clear, useful, persuasive, and on-brief? |
| `naturalness` | Does it sound specific, idiomatic, and non-formulaic? |
| `cefr_fit` | Does the language fit the requested level—not merely look advanced? |
| `facts_ok` | Are all factual claims supported by the brief? |
| `would_use` | Would you use it after at most ten minutes of editing? |

The three scores stay separate. `naturalness` is a reader impression, not
proof that text was written by a human.

Rating anchors:

- **1:** misses the requirement
- **3:** mixed; needs substantial editing
- **5:** strong; needs little or no editing

For `cefr_fit`, 5 means a clear fit to the requested level. It does not mean
"more sophisticated language." For the two booleans, use `true` or `false`.

## Run it

Requirements: Python 3.9+ and whatever model interface you already use.

```bash
python3 bench.py prompts
python3 bench.py new "Model Name" --provider "Provider"
```

The second command creates a dated file under `results/`. For every task:

1. Start from a clean conversation/session.
2. Send the exact prompt with no extra optimization.
3. Paste the unedited output into the result file.
4. Fill in the five ratings, ideally without looking at the model name—or leave
   every rating `null` and publish the run transparently as awaiting review.

Then validate the file and rebuild the page data:

```bash
python3 bench.py check results/model-name-YYYY-MM-DD.json
python3 bench.py build
python3 -m http.server 8000 -d docs
```

Open <http://localhost:8000>. GitHub Pages can publish the same site directly
from the repository's `/docs` folder; there is no build step.

## Reproducibility rules

- Use every public task. Do not cherry-pick outputs.
- Use one generation per task for the normal track.
- Record provider, exact model/version if known, date, temperature, and any
  system prompt in `run`.
- Keep the model output byte-for-byte except for JSON escaping.
- State who rated the run in `run.evaluator`.
- A rerun is a new result file; never replace an older run silently.

One sample is intentionally cheap but noisy. Before making an expensive model
choice, repeat only the top two candidates three times.

## Contribute a result

Fork the repository, add one complete-output JSON file to `results/`, run
`python3 bench.py check <file>` and `python3 bench.py build`, then open a PR
containing the raw result and updated `docs/leaderboard.json`.

Scores are self-reported unless a maintainer says otherwise. Reviewers can
inspect every public output, metadata field, and rating. This is collaborative
evidence, not an audit certificate. Unrated runs are welcome as raw evidence,
but the site keeps them out of the visual ranking until a human evaluates them.

## Hidden canary set

`private/hidden.json` exists only in the maintainer's local checkout and is
ignored by Git. `data/hidden.sha256` publicly commits to its exact contents.
The holdout is a small overfitting check, not a second leaderboard.

Run it locally with:

```bash
python3 bench.py prompts --tasks private/hidden.json
python3 bench.py new "Model Name" --provider "Provider" \
  --tasks private/hidden.json --out private/results/model-name.json
python3 bench.py check private/results/model-name.json
sha256sum -c data/hidden.sha256
```

Do not put hidden prompts or raw hidden outputs in a public PR. Publish only a
rounded summary and task count if a hidden result needs to be discussed. When
the set leaks, reveal it, move it into the public set, create a new local set,
and update the commitment.

## License

Code and original benchmark material are MIT licensed. Model outputs may be
subject to their provider's terms; contributors are responsible for having the
right to publish them.
