# Interrupted OpenCode experiment

Analyzed 2026-09-26. This snapshot contains 135 finished attempts of 192 planned: 78 eligible measurements, 103 passing implementations and 57 unstarted cells. Of the 103 passing implementations, 25 were excluded from efficiency comparisons because completion or measurement requirements were not met. One finished attempt records an interruption. No result files were repaired or reclassified.

This is one SQLite coding task, OpenCode only, with uneven coverage of eight conditions and at most three repetitions per cell. It cannot compare harnesses or establish a general model ranking. Earlier pilots used different limits and are excluded.

## Findings

For Luna, keep baseline as the default. Caveman is worth a larger controlled follow-up; RTK has not shown a useful speed improvement here. Combining interventions did not improve the observed median. All 16 Luna attempts passed and were eligible, so its comparison is not filtered by failures, but the tiny and uneven sample still prevents a causal conclusion.

| Luna condition | Eligible n | Median tokens | Median seconds | Estimated USD | Tokens vs baseline |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 2 | 208,863 | 207.3 | 0.02390 | +0.0% |
| caveman | 3 | 187,249 | 197.5 | 0.02172 | -10.3% |
| caveman+rtk | 2 | 475,804 | 409.1 | 0.03455 | +127.8% |
| ponytail | 1 | 401,087 | 259.2 | 0.03213 | +92.0% |
| ponytail+caveman | 2 | 240,940 | 322.5 | 0.02474 | +15.4% |
| ponytail+caveman+rtk | 3 | 334,512 | 267.7 | 0.03009 | +60.2% |
| ponytail+rtk | 0 | unknown | unknown | unknown | unknown |
| rtk | 3 | 195,220 | 261.2 | 0.02247 | -6.5% |

Baseline token counts range from 154,061 to 263,665; Caveman ranges from 170,722 to 263,044 and RTK from 157,301 to 279,135. These overlapping ranges make small median savings inconclusive. Cached input is included in total tokens, so token changes do not translate directly into cost changes. CPA costs below are retail equivalents under the frozen pricing assumptions, not charges to the OpenRouter key.

## Coverage by model

Code-pass requires both acceptance and original regression tests. Eligible additionally requires clean completion, complete usage, no pending requests and verified condition delivery. Exclusions overlap in summary.json.

| Model | Finished | Code-pass | Eligible | Median eligible seconds | Reported OR USD subtotal |
| --- | ---: | ---: | ---: | ---: | ---: |
| gpt-5.6-luna | 16 | 16 | 16 | 243.2 | not applicable |
| inclusionai/ling-3.0-flash | 19 | 18 | 18 | 119.6 | 0.088101 |
| inclusionai/ling-3.0-flash-vl:free | 16 | 14 | 9 | 213.8 | 0.000000 |
| meta/muse-spark-1.3-contributor | 19 | 19 | 15 | 324.7 | 0.255604 |
| nex-agi/nex-n2.5-mini:free | 15 | 1 | 1 | 471.0 | 0.000000 |
| nex-agi/nex-n2.5-pro:free | 18 | 15 | 0 | unknown | 0.000000 |
| xiaomi/mimo-v2.6-flash | 13 | 11 | 10 | 327.7 | 0.099166 |
| z-ai/glm-5.3-flash | 19 | 9 | 9 | 380.4 | 0.178224 |

Known OpenRouter cost across all finished attempts, including failures: $0.621095. This is a reported subtotal, not a reconciled invoice or complete spend where accounting is missing. Free model responses reported zero cost. Luna retail-equivalent estimated total: $0.421962.

Nex Mini had 13 timeouts in 15 attempts and only one passing implementation. Nex Pro timed out in all 18 attempts, even though 15 implementations passed the code checks. Together they consumed 7.98 hours of recorded run time. Passing code after a timeout is useful diagnostic evidence, but cannot be treated as a clean completion-time observation.

Paid Ling completed 18 eligible runs out of 19 and had the lowest observed median completion time among these model groups. The model groups contain different condition mixes, so this is descriptive, not a controlled speed ranking. GLM passed only 9 of 19 attempts under this protocol. Raising its output budget would define a new experiment; it must not be applied retroactively to this batch.

Successful measurements for every model and condition, including min/max ranges and baseline deltas, are in [summary.json](summary.json) and [summary.md](summary.md). Do not pool models to select an intervention winner: unequal coverage and failed attempts would distort that comparison.

## Reproduction and next experiment

From the repository root:

```bash
python3 bench.py agentbench report --batch opencode-01 --output benches/agentbench/results/opencode-01
```

This reads saved artifacts and makes no inference requests. runs.json exports only selected fields, source hashes and per-result/upstream hashes. It omits raw conversations, credentials and local configuration. coverage.json lists missing job IDs. Raw artifacts remain local under .scratch/agentbench/runs/opencode-01. The hashes support local verification; they do not make unavailable raw artifacts independently reproducible.

Keep this interrupted batch as a historical snapshot. For a follow-up, prioritize a balanced Luna baseline/Caveman/RTK comparison with more repetitions, then test whether the effect repeats on another task with larger command outputs. RTK may have more opportunity there; this task does not establish that. Test Codex separately after compatibility smoke checks. Do not silently drop failing runs or change budgets within an existing batch.

Verification: reporting tests cover partial coverage, missing conditions, passing code excluded by timeout, sanitized export and inconsistent eligibility. Existing runtime-dependent tests require the originally pinned executables; the installed Codex binary has changed, so those three checks currently stop at the fingerprint guard. No setup refresh or inference was performed for this analysis.
