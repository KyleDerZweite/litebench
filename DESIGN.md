# Lean design and research reconsideration

## Decision

Build a repeatable personal smoke test, not a miniature research institute.
The attached research is right about separating copy quality, perceived
naturalness, and CEFR fit. Its full proposal becomes unnecessary and
unaffordable once the goal changes from a publication-grade benchmark to:

> Which model produces copy I can use, in German and English, with little
> editing and no invented facts?

That question can be answered directionally with a small prompt set, honest
raw outputs, and transparent evaluation provenance.

## What survived the research

- German and English are both first-class.
- CEFR fit is separate from quality. A great C1 answer fails an A2 request.
- Perceived naturalness is separate from provenance detection.
- Factual constraints and run metadata matter.
- Public prompts and a private holdout serve different purposes.
- Raw outputs matter more than decimal-heavy rankings.

## What V0 cuts

| Large proposal | V0 choice | Reason |
|---|---|---|
| 1,920+ tasks | 8 public + 4 hidden | Enough to reject obvious poor fits; cheap to repeat |
| A1–C2 full matrix | A2, B1, B2, C1 | The useful middle; A1/C2 add edge-case cost |
| Writing and speech | Writing only | Speech evaluates an LLM + TTS system and needs a new rubric |
| Human control corpus | None | Needed for scientific human-vs-AI claims, not model selection |
| Expert and naive rater panels | No panel | Personal preference is the eventual target signal |
| LLM judge ensemble | One blinded judge call per output | Cheap first pass with judge bias clearly labelled |
| AI-text detectors | None | They do not measure quality and can penalize L2 writing |
| Dynamic rubrics | Five fixed fields | Easier to understand and compare over time |
| Elo, confidence intervals, Rasch models | Raw means and rates | Eight tasks cannot support fake statistical precision |
| One composite score | Separate scorecard | Prevents one strength from hiding a critical weakness |
| Provider adapters | Manual capture | Avoids credentials, SDKs, API churn, and provider lock-in |

This means V0 cannot support claims such as "indistinguishable from humans,"
"CEFR-certified," or "best model overall." It can support the narrower claim:
"On these disclosed tasks, under these settings, this output was more useful
to this evaluator."

## Prompt set

The public set has four localized scenario pairs:

1. Product description, A2
2. Landing-page hero, B1
3. Social ad, B2
4. Retention email, C1

Each prompt supplies allowed facts, audience, channel, deliverables, tone, and
length. DE and EN tasks share a business problem but are localized rather than
literal translations.

The set stays small enough that one model can be generated and rated in roughly
30–60 minutes. Default sampling is one output per prompt. Creative variance is
handled economically: repeat only finalists, not every model.

## Evaluation protocol

The evaluator assigns three 1–5 scores and two booleans. The headline result is
a scorecard, never a winner number:

```text
copy quality | naturalness | CEFR fit | facts okay % | would use %
```

Ratings are subjective by design. Consistency matters more than pretending
they are objective. The first published batch uses a separate `gpt-5.6-sol`
max-reasoning call for each answer. The candidate model and reasoning effort
were hidden from the judge. The exact prompt is committed at
`data/judge-ai-provisional-v0.2.txt`. These scores are provisional and have no
human validation.

For a human comparison, rate outputs in a shuffled copy of the files with model
names hidden. Add human ratings as separate runs and do not average evaluators
with different needs without showing who they were.

## Result presentation

The static UI follows the single-panel information architecture of
[SkateBench](https://skatebench.t3.gg/) and
[SnitchBench](https://snitchbench.t3.gg/): compact brand/status header, one tab
bar, one model filter, and one chart area whose content changes in place. It
does not reuse their logos or benchmark content.

Each score dimension gets a selectable CSS bar chart; `Matrix` swaps the same
panel to the full score table. This preserves the interaction and visual density
without adding their Next.js, Tailwind, Radix UI, and Recharts stack. A scatter
plot remains inappropriate until V0 collects another continuous measure such as
cost or latency.

## Public and hidden tracks

### Public development set

The public set enables cloning, reproduction, inspection, and PRs. It will
eventually be present in model training data, so it is useful for transparent
comparison but weak evidence of generalization.

### Private canary set

The hidden set is deliberately boring:

- Stored only at `private/hidden.json`, which Git ignores.
- Four tasks using the same schema but different products and constraints.
- Fixed before model runs; `data/hidden.sha256` commits to the exact bytes.
- Run only by a maintainer with legitimate access to the model.
- Raw prompts and outputs remain private; only rounded aggregates and `n` may
  be published.
- Never used to tune prompts or model settings.

The hash proves the set was not changed after seeing a result; it does not
encrypt or protect a leaked file. If multiple maintainers need access, the
next smallest step is a private sibling repository. A public GitHub Action
with secrets is intentionally deferred because fork PRs and untrusted code
make that workflow easy to get wrong.

The four-item holdout is only a canary. If public and hidden results strongly
disagree, investigate; do not rank models from four private samples.

## Community result policy

A result PR should contain:

- one raw output for every public task;
- exact model/provider/date and known generation settings;
- one evaluator name or handle;
- either all ratings plus transparent evaluator metadata, or all-null ratings
  clearly marked as awaiting review;
- regenerated static leaderboard data.

Maintainers review schema and obvious protocol violations, not whether a
subjective rating is "correct." Competing evaluations can coexist as separate
runs. AI ratings must be labelled provisional and must not imply human
validation. Unrated runs remain visible as raw evidence but are excluded from
metric rankings. Verified hidden runs are a maintainer annotation, not
something a contributor can self-assert.

## Cost ceiling

Infrastructure cost is zero: Python standard library plus GitHub Pages. The
only monetary cost is model generation and optional judge calls. No paid
annotation or hosted database is needed for V0.

## Add things only when pain proves the need

- Add A1/C2 only when real copy work requires those levels.
- Add prompts when conclusions hinge on a single task family.
- Add a blind-review UI when more than one evaluator rates runs regularly.
- Add an API/CLI adapter after three manual runs show repeated busywork.
- Add pairwise comparison when 1–5 scores cannot separate finalists.
- Add speech only for a concrete voice-system buying decision.
- Add statistical intervals only after repeated samples make them meaningful.

Until one of those triggers occurs, the missing feature is intentional.
