# Proposed automatic evaluation

Status: draft. The `2026-09-04-rerun-01` outputs have not been scored.

## Panel

Use three model families. Each judge gets the same suite rubric and score
anchors, plus one short audit focus.

| Judge | Audit focus |
|---|---|
| GPT-5.6 Sol max | Facts, hard constraints, requested format, and score caps |
| Gemini 3.8 Flash High | Idiom, register, audience fit, rhythm, and CEFR signals |
| GLM-5.3-Flash high | Stock phrasing, repetition, generic claims, and overlooked defects |

The focus note tells a judge where to look twice. It does not change the score
scale or give one judge a different rubric. A mixed panel should catch more
failure types than three Sol calls, but GLM should earn an equal vote in a
small calibration run first, especially for German.

## Strict score anchors

Each judge returns one integer score from 0 to 100.

- 95 to 100: publishable as written; 100 should be rare
- 85 to 94: publishable after tiny edits
- 70 to 84: usable, with clear edits needed
- 50 to 69: substantial revision needed
- 25 to 49: major failure
- 0 to 24: unusable, off-task, or not the requested deliverable

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

- score: arithmetic mean, rounded to one decimal
- judge delta: each score minus that mean
- deviation: population standard deviation across the three scores
- disagreement flag: score range of 20 points or more

For a model row, first average each judge across the same tasks. The displayed
score is the mean of those three judge averages. The chart error bar is one
population standard deviation across those judge averages. This measures judge
disagreement. The later distribution view should use per-task mean scores and
must not reuse the judge error bar.

## Cheap calibration before the full run

The full batch needs 960 judge calls. Start with 24 outputs chosen before any
scores are seen. Cover all suites, both languages, and a spread of model and
effort settings. Compare the three judges with a small set of personal ratings.

Freeze the prompts and thresholds only after that check. If GLM is erratic or
weak in one language, keep its flags as a disagreement signal and calculate
the score from Sol and Gemini. Do not tune thresholds after viewing the full
leaderboard.
