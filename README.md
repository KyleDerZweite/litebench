# LiteBench

LiteBench contains small tests for AI writing models. Each suite tests one
thing with its own prompts and evaluator.

Live results: <https://kylederzweite.github.io/litebench/>

## Included suites

| Suite | Question | Status |
|---|---|---|
| **CopyBench Lite** | Does the writing follow the copy brief? | 19 configurations, 152 panel-scored outputs |
| **NaturalBench Lite** | Does the writing sound idiomatic and free of stock AI habits? | 19 configurations, 76 panel-scored outputs |
| **CEFRBench Lite** | Does the writing match the requested CEFR level? | 19 configurations, 152 panel-scored outputs |

CopyBench scores do not count toward the other suites.

The current leaderboard uses the `2026-09-04-rerun-01` batch. Each of its 380
outputs received three independent, blinded AI judgments from GPT-5.6 Sol max,
Gemini 3.8 Flash High, and GLM-5.3-Flash high. No person has reviewed the
scores. Treat them as initial guidance, not ground truth.

The earlier 120 single-judge CopyBench results remain in the repository but do
not feed the current leaderboard. See [`EVALUATION.md`](EVALUATION.md) for the
panel method and limitations.

## Dashboard

The site uses [SkateBench](https://github.com/T3-Content/skatebench/tree/main/visualizer)
styling with the [DeepSWE](https://deepswe.datacurve.ai/) layout. One chart
plots score against average cost, output tokens, or latency. Lines connect the
reasoning levels for each model. Vertical bars show one population standard
deviation across the three judge averages. Hovering a point shows all three.
The table below shows either the best level per model or every level.

All scores run from 0.00 to 100.00. When scores tie, `Best` picks the lower
reasoning level.

There is no Pass@1 yet. CopyBench has a graded rubric, not a binary pass rule.
Choosing a threshold after seeing the results would bias it.

Cost is estimated for candidate generation only. `bench.py` combines recorded
token counts with the model rates saved in [`pricing.json`](pricing.json) from
[models.dev](https://models.dev/api.json). The estimate excludes cache
discounts, proxy fees, and judge calls.

## Panel scoring

The shared panel protocol lives in
[`benches/judge-panel-v0.1.json`](benches/judge-panel-v0.1.json). Each suite has
its own rubric. Each judge adds a small audit focus without changing the score
scale. Every evaluation file keeps the three scores, their differences from
the mean, cited issues, response metadata, and raw judge JSON.

This first panel is not calibrated against human ratings. Future protocols must
use a new version and keep these results intact.

## Files

```text
benches/
  copybench/       prompts, raw generations, panel evaluations, legacy results
  naturalbench/    prompts, raw generations, panel evaluations
  cefrbench/       prompts, raw generations, panel evaluations
  judge-panel-v0.1.json
visualizer/        static Next.js site
bench.py           result checks and aggregation
pricing.json       models.dev rates used for cost estimates
EVALUATION.md       proposed three-judge protocol
```

## Run CopyBench Lite

You need Python 3.9 or newer and your own model interface.

```bash
python3 bench.py prompts
python3 bench.py new "Model Name" --provider "Provider"
```

For each task:

1. Start a clean model session.
2. Send the prompt without changes.
3. Store the output without edits.
4. Record the generation metadata.
5. Add the evaluator metadata, or leave the scores `null`.

Check the files and rebuild the panel data:

```bash
python3 bench.py panel-check
python3 bench.py build
```

Run the site:

```bash
cd visualizer
bun install
bun run dev
```

## Add a result

Fork the repository and add the raw generation under the matching suite. Store
its three-judge evaluation under that suite's `evaluations/` directory. Run the
two check commands above, then include the rebuilt
`visualizer/data/leaderboard.json` in the pull request.

Keep model output unchanged. Record the model, effort, evaluator versions,
prompt hashes, token counts, and latency. Use a new evaluation ID if the panel
or rubric changes.

## Hidden prompts

The private canary stays in `private/hidden.json`, which Git ignores. Its public
hash is `benches/copybench/hidden.sha256`.

```bash
python3 bench.py prompts --tasks private/hidden.json
sha256sum -c benches/copybench/hidden.sha256
```

Never publish the hidden prompts or their raw outputs. If they leak, move them
to the public set and replace them.

## License and credits

LiteBench code and original benchmark material use the MIT License. The
visualizer adapts MIT-licensed SkateBench code. See
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Model outputs may have
separate provider terms.
