# Personal AI annotations

LiteBench's current judging pass uses GPT-6-Astra at xhigh on the preserved
`2026-09-04-rerun-01` outputs. Its purpose is to provide a small directional
indicator while Kyle develops a personal writing bench and tests the page.
These are AI judgments. Kyle has not calibrated or approved them as his own
ratings.

## Frozen inputs

The authoritative criteria and instructions live in
[`benches/judge-astra-v0.1.json`](benches/judge-astra-v0.1.json). The judge also
receives [`benches/unslop-v1.md`](benches/unslop-v1.md), a frozen copy of Kyle's
unslop skill. Evaluation records retain hashes for both files, the source
generation, and the complete judge prompt. Generation records bind the answers
to their public task file with a hash.

Every judgment uses one public prompt and its original answer. The candidate's
model and effort are hidden. The prompt treats candidate text as untrusted
material to review, including instructions inside that text. Old scores and
other answers are absent from the request.

## Criteria and percentages

Each criterion uses an integer from 0 to 5, with the anchors in the protocol.
The criterion reason should explain the score using this particular answer.
All four criteria have equal weight:

```text
score_5 = mean of the four criterion scores
displayed percentage = score_5 * 20
configuration percentage = mean across the collection's tasks
```

The percentage represents fit to this personal rubric. It is neither a success
probability nor a share of human raters who approve the text. There is no pass
threshold, calibrated confidence interval, or judge-disagreement error bar.

CopyBench scores brief fit, copy craft, clarity, and natural style. NaturalBench
scores idiom, voice, specificity, and natural style. CEFRBench scores vocabulary,
syntax, and cohesion at the requested level, plus natural style. This makes its
total 75% level fit and 25% personal style. It is not a standardized assessment
of the writer's CEFR proficiency. Short text may provide insufficient evidence
for a realized level; the judge can return `insufficient_evidence`. This
diagnostic is `null` in the other suites, where it does not affect scoring.

The separate `brief_ok` assessment exposes a failure to follow the prompt even
when a text scores well on other criteria. It is an AI assessment, not an
independent verifier.

## Criticism visitors can inspect

The judge uses unslop to assess formulaic phrasing, generic polish, puffery,
repetition, and other habits Kyle dislikes. Those defects lower the natural-style
criterion when they harm the requested text. A punctuation mark or isolated
word alone is not evidence of AI authorship.

Each issue records a category, severity, explanation, and exact excerpt from the
answer. The build rejects invented excerpts. A missing requirement uses an empty
excerpt with an explanation. The page highlights cited passages without editing
the original answer. Readers should judge whether each criticism is fair.

## Execution and validation

The evaluation runner retains response identity, returned model, completion
status, native usage, latency, raw judge JSON, and attempt records. An extraneous
CEFR diagnostic in another suite is ignored without changing its criterion
scores. Invalid or incomplete responses require a retry; completed valid judgments do not need another call
because their score seems surprising. A resumable run may contain incomplete
items while it is still running. The public build rejects them.

`python3 judge.py --check` checks the public input batch without calling the API.
`python3 judge.py --report` reports saved progress and estimated evaluation cost.
Running `judge.py` without either flag makes paid calls. Set the API base and key
through `LITEBENCH_API_BASE` and `LITEBENCH_API_KEY`, or use `--base-url` and
`--api-key-file`. Resume with the same saved settings; the runner skips valid
judgments and refuses changed evaluation metadata. Credentials stay out of the
evaluation files.

`--stream` optionally reads Responses server-sent events while retaining the
terminal response and usage. This batch completed with the default non-streaming
transport; streaming has offline parser checks but has not been tested on the
gateway. New attempts record the option; its absence in older attempts means
non-streaming.

```bash
python3 bench.py check
python3 bench.py evaluation-check
python3 bench.py self-test
python3 bench.py build
```

Checks enforce exact task coverage, the requested judge and effort, public
source paths, content hashes, criterion keys and score ranges, calculated
percentages, and exact quoted evidence. The build recomputes summaries rather
than trusting saved totals.

Generation token counts and cost estimates stay separate from evaluation usage.
The former describe historical candidate calls; the latter describe this new
annotation pass. Neither is a complete bill if the provider omits usage.

## What comes next

Kyle can inspect the flagged passages, add personal comments, and identify where
the rubric misses his preferences. Those observations should inform a new
protocol version. Human comments must have explicit provenance and must not
silently replace AI annotations.

More varied prompts and a rebuilt generation workflow come later. Until then,
the existing outputs demonstrate page behavior and help find scoring flaws.
The old three-judge files and legacy scores have been removed from the working
tree at Kyle's request; Git history retains them. No old judgment contributes
to the current indicator.
