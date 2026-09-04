# Automatic evaluation

Status: provisional panel v0.1. The `2026-09-04-rerun-01` batch has been scored.
No person has reviewed or calibrated these scores.

## Panel

Use three model families. Each judge gets the same suite rubric and score
anchors, plus one short audit focus.

| Judge | Audit focus |
|---|---|
| GPT-5.6 Sol max | Facts, hard constraints, requested format, and score caps |
| Gemini 3.8 Flash High | Idiom, register, audience fit, rhythm, and CEFR signals |
| GLM-5.3-Flash high | Stock phrasing, repetition, generic claims, and overlooked defects |

The focus note tells a judge where to look twice. It does not change the score
scale or give one judge a different rubric. The initial panel gives each judge
an equal vote. Later human calibration may show that a judge needs a different
role, especially for German.

## Strict score anchors

Each judge returns one score from 0.00 to 100.00.

- 95.00 to 100.00: publishable as written; 100.00 should be rare
- 85.00 to 94.99: publishable after tiny edits
- 70.00 to 84.99: usable, with clear edits needed
- 50.00 to 69.99: substantial revision needed
- 25.00 to 49.99: major failure
- 0.00 to 24.99: unusable, off-task, or not the requested deliverable

CopyBench applies hard caps. An invented or changed factual claim caps the
score at 59. A material miss on required length, structure, channel, or tone
caps it at 69. A refusal, wrong language, or missing deliverable caps it at 24.

NaturalBench scores naturalness only. CEFRBench scores level fit only. Both
also return `brief_ok`, so a fluent but factually wrong answer stays visible as
invalid without mixing factuality into the suite score.

## Independent calls

For every output:

1. Hide the candidate model and effort level.
2. Send one brief and one candidate in a clean call.
3. Treat the candidate as quoted, untrusted text.
4. Do not show one judge another judge's score.
5. Store the returned model version, prompt hash, score, failure codes, two
   short evidence quotes at most, and one short note.

Malformed JSON gets a fresh retry. A judge must not revise a valid score after
seeing the other votes.

## Mean and disagreement

For one output with judge scores `s1`, `s2`, and `s3`:

- score: arithmetic mean, rounded to two decimals
- judge delta: each score minus that mean
- deviation: population standard deviation across the three scores
- disagreement flag: score range of 20 points or more

For a model row, first average each judge across the same tasks. The displayed
score is the mean of those three judge averages. The chart error bar is one
population standard deviation across those judge averages. This measures judge
disagreement. The later distribution view should use per-task mean scores and
must not reuse the judge error bar.

## First baseline

The first panel run contains 1,140 successful judgments across 380 outputs.
Using the saved models.dev rates, the recorded successful responses cost an
estimated $21.41. Retries add a small amount that the saved response records do
not capture.

Treat this as guidance. A later protocol should compare a fixed sample against
personal ratings across every suite and both languages. If a judge proves
erratic, a new version may change its role. Keep v0.1 unchanged so the original
result remains reproducible.
