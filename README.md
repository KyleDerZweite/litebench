# LiteBench

LiteBench is my personal writing bench. I'm Kyle, and I want a place to compare
answers to prompts I care about, point out wording I dislike, and develop my
own taste into an explicit rubric. Your preferences may differ. Read the prompt,
inspect the answer, and decide whether the criticism makes sense to you.

Live page: <https://kylederzweite.github.io/litebench/>

The current outputs are demonstration material for building that page and
finding problems in the workflow. They come from an existing generation batch,
with 380 answers across 19 configurations and 20 prompts. They do not establish
current model performance under a controlled generation protocol. Rebuilding
generation is a later step.

## What the percentages mean

GPT-6-Astra at xhigh reviews each prompt and answer using the
[personal rubric](benches/judge-astra-v0.1.json) and a frozen copy of my
[unslop skill](benches/unslop-v1.md). These are AI annotations intended as an
initial proxy for my preferences. They are not my human ratings, and I have
not validated them against my own judgments.

Each answer receives four criterion scores from 0 to 5. The page shows their
equal-weight mean as a percentage. An 80% indicator means an average of 4/5 on
this rubric. It is not an 80% probability that the writing is good or correct.

| Collection | What I want to inspect |
|---|---|
| CopyBench Lite | Fit to the brief, copy craft, clarity, and natural style |
| NaturalBench Lite | Idiom, voice, specificity, and natural style |
| CEFRBench Lite | Vocabulary, syntax, and cohesion for the requested level, plus natural style |

All three indicators include a 25% natural-style criterion. Formulaic writing,
puffery, or empty polish can lower it when the judge cites a problem in context.
CEFRBench therefore includes personal style preferences. Its indicator is not
a certified CEFR assessment.

Open a result to see the full input prompt, unedited answer, criterion reasons,
and highlighted passages the AI judge flags. Missing content receives an
explanation without an invented quote. The chart helps you find examples; the
examples let you make your own judgment.

## Local use

This branch adds a blind pairwise arena experiment alongside the earlier AI assessments.
Switch between **Score** mode and **Browse AI assessments** via the top navigation.

In **Score** mode:
- Two blind answers are drawn for each prompt from the preserved generation batch (`2026-09-04-rerun-01`). Generation files remain the source of truth.
- Model names and configurations stay hidden until you vote.
- Voting options:
  - **A is better** / **B is better**: select the preferred response.
  - **Tie**: record an equal-quality tie.
  - **Both are bad**: record that both model responses were unsatisfactory.
  - **Skip**: advance to another matchup without recording a vote.
- ELO ratings start at 1000 with a K-factor of 32 and replay statelessly from your stored votes. Standings report ratings, total votes, and W · L · T · Bad breakdown.
- Votes persist in browser `localStorage` and can be exported as JSON, imported, or reset. No AI judge is involved in Score mode.

Browse mode keeps the earlier Astra xhigh assessments and criterion highlights for reference.

Use Python 3.9 or newer to rebuild the vote pool from generations only:

```bash
python3 bench.py arena-build
python3 bench.py arena-check
```

Use Python 3.9 or newer to inspect and validate the public data:

```bash
python3 bench.py prompts
python3 bench.py check
python3 bench.py evaluation-check
python3 bench.py self-test
python3 bench.py build
```

`build` verifies the evaluation against the original generations and frozen
rubric before writing `visualizer/data/leaderboard.json`. It rejects incomplete
evaluations. The historical `panel-check` command is an alias for the current
evaluation check.

Run the page with Bun:

```bash
cd visualizer
bun install
bun run dev
```

See [EVALUATION.md](EVALUATION.md) for the judging procedure and
[DESIGN.md](DESIGN.md) for the product decisions.

## Data and costs

Public prompts live in each suite's `public.json`; raw answers and generation
metadata live under `generations/2026-09-04-rerun-01/`. The new AI annotations
live separately under `evaluations/2026-09-05-astra-xhigh-v0.1/`.

The old three-judge evaluations and obsolete rubrics have been removed from the
working tree. Git history retains them. The earlier 120 CopyBench answers in
`benches/copybench/results/` retain their original text and generation metadata,
with all old scores and judge notes removed. They are unscored legacy material
and do not feed the page.

Cost and latency describe the retained generation calls. Generation cost uses
recorded tokens and the historical rates in [pricing.json](pricing.json), unless
the provider reported a cost. These estimates exclude judge calls, cache
discounts, and gateway fees. Evaluation usage is recorded separately. Latency
includes the network and gateway conditions of those calls.

## Contributions and future work

Suggestions about prompts, wording, questionable annotations, and page behavior
are welcome. Point to the exact prompt and answer, then explain what you would
change. My preferences will become more explicit as I review examples.

The next generation protocol will need fresh, more varied briefs and recorded
execution settings. The current page is where we find flaws before doing that
work. The separate [OrcaBench project](https://github.com/KyleDerZweite/orcabench)
will explore coding agents and orchestration,
with my friend and me judging the results.

The private canary remains outside public data. Its commitment is
`benches/copybench/hidden.sha256`. Public builds accept only the public suite
generation directories; keep private prompts and answers out of contributions.

## License and credits

LiteBench code and original benchmark material use the MIT License. The page
adapts MIT-licensed [SkateBench](https://github.com/T3-Content/skatebench)
code and the [DeepSWE](https://deepswe.datacurve.ai/) layout. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Model outputs may have separate
provider terms.
