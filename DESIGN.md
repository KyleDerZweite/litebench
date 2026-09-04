# LiteBench design

## Decision

LiteBench is an umbrella for small benchmarks, not one score that mixes several
writing constructs. Every included suite must own:

- one primary question;
- its own public prompts;
- its own evaluator instructions;
- its own results;
- the same visualizer and contribution format.

This keeps a result interpretable. A model can be good at copy, sound formulaic,
and miss a requested CEFR level. Those are three findings, not one blended score.

## Suites

### CopyBench Lite

Primary metric: copy quality. It asks whether an answer fulfils the brief,
serves the audience and channel, communicates clearly, persuades appropriately,
and respects factual constraints.

The first published batch contains 8 bilingual prompts, 15 GPT-5.6 model and
effort configurations, and 120 outputs. Its existing Sol max scores are
AI-provisional and have no human validation.

### NaturalBench Lite

Primary metric: perceived naturalness. Its prompts avoid CEFR targets and do not
ask the evaluator to reward persuasion. The evaluator looks for idiomatic
phrasing, situated voice, rhythm, register, and formulaic model habits.

The initial public set has 4 bilingual tasks. It has no model runs yet.

### CEFRBench Lite

Primary metric: CEFR fit. It uses neutral functional-writing tasks across A2,
B1, B2, and C1 in German and British English. The evaluator does not reward
copy quality, persuasion, or human-likeness.

The initial public set has 8 tasks. It has no model runs yet.

## Shared result layout

The visualizer adapts SkateBench's MIT-licensed visual language and focused
Next.js, Tailwind, and Recharts stack. Its information layout follows DeepSWE:
a score-versus-efficiency plot above a compact leaderboard with model,
reasoning effort, score, estimated cost, output tokens, latency, and raw-result
access. The plot switches between cost, output tokens, and latency while keeping
score on the vertical axis.

`Best` means the configuration with the highest primary score for each base
model. A score tie prefers the lower reasoning effort. `All effort levels`
reveals every configuration. The tradeoff plot always includes every effort
level so the trajectory remains visible.

## Pass@1 and distributions

Pass@1 is meaningful only when a suite has a deterministic binary pass rule.
CopyBench currently uses a graded quality rubric, so converting it to Pass@1
would invent a threshold after seeing the data. The UI and result schema can add
Pass@1 and a pass distribution once a public verifier defines success before a
run is generated.

The current leaderboard already exposes the 0–100 primary score. A dedicated
score distribution can be added beside Pass@1 after the binary verifier exists.

## Operational metrics

Latency and token use come from the original generation response. Judge usage is
not counted as model performance. Latency includes network and proxy effects and
is therefore directional.

CPAMP's model endpoint exposes no price metadata. For the current runs, cost is
estimated from recorded input and output tokens using the OpenAI prices captured
in `pricing.json` from `https://models.dev/api.json`. The calculation uses the
normal uncached input and output rates per million tokens. It excludes cache
discounts, CPAMP or proxy fees, and judge usage. The UI labels this as an
estimate. A provider-reported `cost_usd` value takes precedence when present.

## Public and hidden data

Public prompts enable reproduction and community pull requests. A small private
canary remains at `private/hidden.json`; Git ignores it. The committed hash at
`benches/copybench/hidden.sha256` proves which bytes were used without revealing
the prompts.

The hidden set is only a canary. Four private items cannot support a second
leaderboard or strong statistical claims.

## Contribution boundary

A public run should contain every task, unchanged output, generation metadata,
and transparent evaluation provenance. AI scores must remain visibly
provisional. Human and AI evaluations should be separate records rather than
silently averaged.

No speech benchmark, detector ensemble, database, paid rater panel, or composite
cross-suite score is included. Add one only when a concrete use case justifies
its cost.
