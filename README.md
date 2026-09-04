# LiteBench

LiteBench contains small tests for AI writing models. Each suite tests one
thing with its own prompts and evaluator.

Live results: <https://kylederzweite.github.io/litebench/>

## Included suites

| Suite | Question | Status |
|---|---|---|
| **CopyBench Lite** | Does the writing follow the copy brief? | 15 configurations, 120 outputs |
| **NaturalBench Lite** | Does the writing sound idiomatic and free of stock AI habits? | Prompts and evaluator ready, no runs |
| **CEFRBench Lite** | Does the writing match the requested CEFR level? | Prompts and evaluator ready, no runs |

CopyBench scores do not count toward the other suites.

The 120 CopyBench outputs were each judged in a separate, blinded
`gpt-5.6-sol` max call. No person has reviewed those scores. The site labels
them as provisional AI scores.

## Dashboard

The site uses [SkateBench](https://github.com/T3-Content/skatebench/tree/main/visualizer)
styling with the [DeepSWE](https://deepswe.datacurve.ai/) layout. One chart
plots score against average cost, output tokens, or latency. Lines connect the
reasoning levels for each model. The table below shows either the best level per
model or every level.

All scores are out of 100. When scores tie, `Best` picks the lower reasoning
level.

There is no Pass@1 yet. CopyBench has a graded rubric, not a binary pass rule.
Choosing a threshold after seeing the results would bias it.

Cost is estimated for candidate generation only. `bench.py` combines recorded
token counts with the OpenAI rates saved in [`pricing.json`](pricing.json) from
[models.dev](https://models.dev/api.json). The estimate excludes cache
discounts, proxy fees, and judge calls.

## NaturalBench scoring

The NaturalBench evaluator reports a score plus machine-readable `slop_flags`.
Each flag has a stable code, a count, and short quotes from the output. The
codes cover stock phrasing, inflated wording, vague claims, rigid structure,
punctuation habits, formatting habits, filler, and chatbot residue.

This schema is ready for automatic judging one output at a time. It has not
been calibrated against human ratings, so future results must keep the
evaluator model and prompt version.

## Files

```text
benches/
  copybench/       prompts, evaluator, hidden-set hash, results
  naturalbench/    prompts and slop-aware evaluator
  cefrbench/       prompts and evaluator
visualizer/        static Next.js site
bench.py           result checks and aggregation
pricing.json       models.dev rates used for cost estimates
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

Check the files and rebuild the data:

```bash
python3 bench.py check
python3 bench.py build
```

Run the site:

```bash
cd visualizer
bun install
bun run dev
```

## Add a CopyBench result

Fork the repository and add one complete JSON run under
`benches/copybench/results/`. Run the two check commands above, then include the
raw run and rebuilt `visualizer/data/leaderboard.json` in the pull request.

Do not edit model output. Record the model, settings, evaluator, and evaluation
type. `bench.py` supports CopyBench Lite today. The other suites will get result
support with their first runs.

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
