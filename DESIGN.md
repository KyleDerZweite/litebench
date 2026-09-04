# LiteBench design

## One question per suite

LiteBench does not combine copy quality, naturalness, and CEFR fit into one
score. A model may write useful copy that still sounds formulaic. It may also
write fluent text at the wrong language level. Separate suites make those
failures visible.

Each suite keeps its prompts, evaluator, results, and main score separate. They
share the same file format and results page.

## CopyBench Lite

CopyBench asks whether the output follows the brief, fits the audience and
channel, makes a clear case, and sticks to the supplied facts.

The current panel batch has 8 bilingual prompts and 19 model configurations.
It contains 152 outputs. GPT-5.6 Sol max, Gemini 3.8 Flash High, and
GLM-5.3-Flash high judged every output independently. These scores are
provisional, and no person has reviewed them.

The earlier 120-output, single-judge batch remains as a legacy result set.

The public prompts and v0.2 evaluator stay unchanged because the result files
refer to them. A changed prompt or rubric must use a new version.

## NaturalBench Lite

NaturalBench asks whether the output sounds idiomatic and written for its exact
situation. Its evaluator checks rhythm, concrete wording, register, and fit
between the sender and reader. It also flags stock AI writing habits.

The evaluator returns stable flag codes, counts, and short quotes. This makes
future automatic runs easy to aggregate without turning one suspicious word
into proof of AI authorship. Context still matters. The first automatic results
must name the evaluator model and prompt version, and the site must call them
provisional until they have been checked against human ratings.

The public set has 4 bilingual tasks, 19 configurations, and 76 panel-scored
outputs.

## CEFRBench Lite

CEFRBench asks whether the output matches the requested CEFR level. Its tasks
cover A2, B1, B2, and C1 in German and British English. The evaluator does not
reward persuasion or naturalness.

The public set has 8 tasks, 19 configurations, and 152 panel-scored outputs.

## Results page

The site uses SkateBench styling and a DeepSWE-style layout. The chart keeps
score on the vertical axis and switches the horizontal axis between cost,
output tokens, and latency. It connects all effort levels for each model.
Vertical error bars show the standard deviation across the three judge
averages.

The table starts with the highest-scoring effort per model. A tied score picks
the lower effort. `All effort levels` shows every configuration.

## Pass@1

There is no Pass@1 yet. CopyBench has no binary verifier, and choosing a cutoff
after seeing the scores would bias it. Define and publish a pass rule before
adding that chart.

## Runtime measurements

Token counts and latency come from each generation response. Latency includes
network and proxy time, so it is only useful for these runs.

CPAMP does not report prices. LiteBench estimates generation cost from the
recorded token counts and the model rates in `pricing.json`. The
file records the models.dev source and capture date. The estimate does not
include cache discounts, proxy fees, or judge calls. A provider-reported
`cost_usd` value wins when a result contains one.

## Public and hidden prompts

Public prompts let contributors reproduce a run and inspect each output. The
private canary stays in `private/hidden.json`, which Git ignores. The public
hash at `benches/copybench/hidden.sha256` proves which file was used without
revealing it.

The canary has only 4 items. It can catch a large mismatch with the public set,
but it cannot support its own ranking.

## Results and review

A result must contain every task, the unedited output, generation metadata, and
the evaluator details. AI scores stay separate from later human scores.

LiteBench does not include speech, AI authorship detection, a database, or paid
raters. Add one only when a benchmark needs it.
