# LiteBench design

## A personal writing bench

LiteBench records Kyle's writing preferences as they develop. The useful result
is an inspectable example: what the prompt asked for, what the model wrote, and
which wording deserves criticism. Visitors can disagree with the rubric or
annotations after seeing the same evidence.

The existing generations demonstrate the page and evaluation workflow. Their
job is to reveal flaws we can fix. They are not a controlled experiment for
claiming that a model or reasoning effort is generally better.

## Inspect the writing

Keep every candidate answer unchanged. Show the full input prompt next to the
answer, with an option to inspect exact passages flagged by the AI judge. A
highlight must quote the candidate exactly. Missing required content appears as
a written explanation, since there is no passage to highlight.

Call these AI annotations. Kyle has not supplied human ratings for this batch.
Future human comments must identify their author so visitors can distinguish
them from the current GPT-6-Astra xhigh judgments.

The chart and table provide an index into examples. Show percentages, criterion
reasons, and the separate brief-compliance assessment. Do not imply that a small
score difference predicts performance on other tasks. A best-observed effort
view selects within these existing examples, which favors lucky configurations.

## The rubric

The frozen protocol in `benches/judge-astra-v0.1.json` defines four criteria for
each collection. Their integer scores range from 0 to 5. An answer's indicator
is their equal-weight mean multiplied by 20; a configuration's indicator is the
mean across that collection's tasks.

CopyBench covers brief fit, copy craft, clarity, and natural style. NaturalBench
covers idiom, voice, specificity, and natural style. CEFRBench covers vocabulary,
syntax, and cohesion at the requested level, plus natural style. Its total is
75% level fit and 25% personal style preference.

The unslop snapshot informs the style criterion and cited issues. It describes
habits Kyle dislikes, not a detector of AI authorship. Context matters more
than matching a suspicious word. The detailed evaluation procedure belongs in
`EVALUATION.md`.

## Data boundaries

Store raw generations, AI evaluations, and the derived page data separately.
The build derives every total from validated judgments and original generation
metadata. Hashes connect the evaluation to its prompt, public task file, source
generation, protocol, and skill snapshot. Only public generation directories may
supply text to the static page.

Old judgments have been removed at Kyle's request and remain recoverable in
Git history. The 120 legacy CopyBench answers retain their unedited text and
generation metadata, without ratings. They are excluded from the page.

Generation cost and latency are historical context. Keep evaluation costs
separate, preserve unknown usage as unknown, and avoid presenting estimated
spend as a reconciled provider bill.

## Later work

Review examples with Kyle, record personal disagreements, and revise the next
rubric using those observations. Keep a frozen protocol for each judging batch.
Then rebuild generation with more distinct briefs, recorded settings, and a
clear purpose for repeated attempts. Generation changes are deliberately
deferred in the current demonstration pass.

OrcaBench develops separately. It compares complete coding-agent configurations
through checked artifacts and preference votes from Kyle and a friend. Those
human votes need their own result records and scoring rules.
