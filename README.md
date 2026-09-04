# LiteBench

LiteBench is a small open-source home for focused AI writing benchmarks. Each
suite owns one question, one prompt set, and one evaluator. The shared
visualizer is adapted from
[SkateBench](https://github.com/T3-Content/skatebench/tree/main/visualizer).

Live dashboard: <https://kylederzweite.github.io/litebench/>

## Included suites

| Suite | Primary question | Status |
|---|---|---|
| **CopyBench Lite** | Does the answer fulfil the copy brief well? | 15 configurations, 120 outputs |
| **NaturalBench Lite** | Does the writing sound idiomatic and non-formulaic? | Prompts and evaluator ready, no runs |
| **CEFRBench Lite** | Does the language match the requested CEFR level? | Prompts and evaluator ready, no runs |

Existing scores belong only to CopyBench Lite. NaturalBench Lite and CEFRBench
Lite do not reuse those scores.

> **Current limitation:** Each of the 120 CopyBench outputs was scored by a
> separate, blinded `gpt-5.6-sol` max-reasoning call. The ratings are
> **AI-provisional** and none have human validation.

## Dashboard

The visualizer uses SkateBench's visual language and core stack with
[DeepSWE's](https://deepswe.datacurve.ai/) single-page layout: a
score-versus-efficiency plot above a compact leaderboard.
The plot can compare score against estimated average cost, output tokens, or
latency and connects every reasoning level for each model.

`Best` selects the highest CopyBench score for each model. Equal scores prefer
the lower reasoning effort. `All effort levels` exposes every configuration.

Pass@1 is intentionally absent for now. CopyBench currently has a graded quality
rubric, not a deterministic binary verifier. Add Pass@1 and its distribution
only after a public pass rule exists.

Average cost is an estimate for candidate generation only. `bench.py` combines
recorded input and output tokens with the OpenAI rates captured in
[`pricing.json`](pricing.json) from [models.dev](https://models.dev/api.json).
It excludes cache discounts, proxy fees, and evaluator cost.

## Repository layout

```text
benches/
  copybench/       prompts, evaluator, hidden-set commitment, results
  naturalbench/    independent prompts and evaluator
  cefrbench/       independent prompts and evaluator
visualizer/        adapted SkateBench visualizer
bench.py           dependency-free result validation and aggregation
pricing.json       versioned models.dev rates used for cost estimates
```

## Run CopyBench Lite

Requirements: Python 3.9+ and whatever model interface you already use.

```bash
python3 bench.py prompts
python3 bench.py new "Model Name" --provider "Provider"
```

For every task:

1. Start from a clean model session.
2. Send the exact prompt with no extra optimisation.
3. Store the model output unchanged.
4. Record generation metadata.
5. Add transparent evaluator metadata or leave all scores `null`.

Validate and aggregate:

```bash
python3 bench.py check
python3 bench.py build
```

Run the visualizer:

```bash
cd visualizer
bun install
bun run dev
```

## Result rules

- Use every public task and do not cherry-pick outputs.
- Use one generation per task for the normal track.
- Keep model output byte-for-byte except for JSON escaping.
- Record provider, model version, date, reasoning effort, and known settings.
- Mark AI ratings with `evaluation_type: "ai_provisional"` and
  `human_evaluation: false`.
- Treat latency as directional because it includes proxy and network effects.
- Label token-derived monetary cost as estimated and commit its source rates.

## Contribute a CopyBench result

Fork the repository, add one complete JSON run under
`benches/copybench/results/`, then run:

```bash
python3 bench.py check
python3 bench.py build
```

Open a pull request containing the raw run and regenerated
`visualizer/data/leaderboard.json`. Keep every model output unchanged and state
the evaluator and evaluation type. The helper currently supports CopyBench Lite;
the other two suites will get result support with their first real runs.

## Hidden canary

`private/hidden.json` remains local and Git-ignored. The public commitment is
stored at `benches/copybench/hidden.sha256`.

```bash
python3 bench.py prompts --tasks private/hidden.json
sha256sum -c benches/copybench/hidden.sha256
```

Do not publish hidden prompts or their raw outputs. If the set leaks, move it
into the public set and replace it.

## License and attribution

LiteBench code and original benchmark material are MIT licensed. The visualizer
contains an MIT-licensed adaptation of SkateBench. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Model outputs may be subject
to provider terms.
