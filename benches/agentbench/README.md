# AgentBench Lite

Goal: measure the tokens, elapsed time and cost needed to complete the same
verifiable coding task under different harnesses and interventions. Correctness
is a gate for efficiency comparisons, not an AI-judged quality score.

One user prompt starts each autonomous session. The agent inspects files, changes
a small SQLite inventory application and runs tests through multiple tool calls.
There are no human follow-ups, retries of failed solutions, or model substitutions.
The [task](task.md) defines success. Separate acceptance and original regression
tests must pass after the agent exits successfully.

## Run

Linux x86_64 is required. This workstation is prepared with OpenCode 1.18.32,
Codex 0.155.1, RTK 0.49.0, bubblewrap and system Python/pytest. No personal harness
configuration is changed. Run all commands from the repository root.

Supply the dedicated benchmark OpenRouter key in `LITEBENCH_OPENROUTER_KEY`,
either in the environment or in `benches/agentbench/.env`. Environment values
take precedence. The dotenv reader accepts plain or quoted values without shell
expansion. This file is ignored by Git and excluded from protocol snapshots.
For example, in Bash, read it without echoing or putting the value in history:

```bash
read -rsp 'LiteBench OpenRouter key: ' LITEBENCH_OPENROUTER_KEY
export LITEBENCH_OPENROUTER_KEY
```

CPA uses the existing protected `~/.codex/kylehub.key` by reference. An explicit
`LITEBENCH_CPA_KEY` overrides that reference. Neither key is mounted into an agent
run, written to results, or copied from OpenCode's personal authentication store.

```bash
python3 bench.py agentbench check
python3 bench.py agentbench plan
```

`check` verifies the runtime, credential presence and filesystem isolation without
inference. All nine initial model IDs were found in the public OpenRouter catalog
on 2026-09-22, using `openai/gpt-5.6-luna` for the CPA retail-price reference.
Catalog presence does not establish endpoint, account or tool-call compatibility.

Smoke-test one OpenRouter model in the active OpenCode harness before starting a full batch:

```bash
python3 bench.py agentbench smoke --batch smoke-mimo \
  --model xiaomi/mimo-v2.6-flash --condition baseline
```

A smoke test asks for one `git status` tool call and a final answer. For an RTK
smoke, use `--condition rtk`; it must record an actual rewrite. Smoke results are
kept separate from benchmark results. Provider errors are retained, not repaired
by substituting another model. Use a new batch name for a corrected attempt.

Run the complete initial matrix:

```bash
python3 bench.py agentbench run --batch opencode-01
python3 bench.py agentbench report --batch opencode-01
```

This starts **192 sequential sessions**: eight models, OpenCode, eight conditions
and three repetitions of every model/condition combination. Codex is deferred
while its OpenRouter parameter compatibility is investigated. Qwen free is
temporarily excluded because of repeated upstream shared-pool rate limits. Their
definitions remain in `deferred_harnesses` and `deferred_models` in the matrix;
these entries are not scheduled.
The default order is deterministically shuffled. The full batch can take hours
and free endpoints can rate-limit. There is a 15-minute wall limit per run,
60 forwarded inference requests and a 3,000,000 reported-token stopping threshold.
A request already in flight can exceed the token threshold. These are per-run
bounds, not a global spending guarantee.

Start smaller with a filter; omitted dimensions retain their full defaults:

```bash
python3 bench.py agentbench run --batch luna-pilot \
  --model gpt-5.6-luna --harness opencode --condition baseline --repetitions 1
```

Repeat `--model`, `--harness` or `--condition` to select several values. Repeating
the exact command with the same batch name resumes only unstarted cells. Existing
attempts, including interrupted ones, are never overwritten or rerun. Changed
protocol files, selections or runtimes require a new batch name. Ctrl-C stops the
current agent, retains its evidence, and stops the batch after evaluation.

Outputs are local and Git-ignored under `.scratch/agentbench/runs/BATCH/`:

* `summary.md` and `summary.json`: grouped medians and ranges, with eligibility
  counts and totals covering failed attempts too.
* `manifest.json` and `protocol/`: matrix, runtime hashes and frozen source copies.
* Each run: submitted workspace, diff including added files, raw harness events,
  request bodies, upstream responses and usage, hook audit, acceptance output,
  regression output and machine-readable result.

Requests contain the public benchmark's prompts and tool results. Keep raw runs
local unless deliberately publishing them. The existing writing leaderboard and
human-vote arena do not mix these measurements with writing quality scores.

## Matrix and interventions

[Matrix](matrix.json) is the sole owner of model selection, endpoints, repetitions
and bounds. The active matrix uses OpenCode only. Luna uses CPA with high
reasoning. The other seven active models use the dedicated OpenRouter key, with
model/provider default reasoning. The Codex adapter is retained for separate
compatibility testing; restoring it requires editing the active harness list.
There is no Astra in the initial matrix. To add it later, add a model entry with
provider `cpa`, reasoning `high` or another chosen setting, context/output limits,
and its price reference in [pricing.json](pricing.json). The same runner supports
OpenRouter models in Codex and CPA models in OpenCode.

The eight conditions are baseline, ponytail, caveman, rtk, ponytail+caveman,
ponytail+rtk, caveman+rtk, and ponytail+caveman+rtk. Shell-quote a condition if your
shell treats its characters specially.

Baseline retains core harness behavior, including native prompts, tool schemas,
compaction and session-title generation. It loads no Fleet skills, personal
instructions, external plugins or MCP servers. Codex bundled skill discovery is
explicitly disabled too; outgoing requests are checked for unwanted skill catalogs. Both harnesses receive identical
intervention text through the root `AGENTS.md` in applicable conditions. These
instructions and any awareness overhead count toward measured input tokens.

Ponytail Ultra and Caveman full are frozen in [prompts](prompts/SOURCES.md).
Caveman changes response style; it does not compress historical input. RTK 0.49.0
rewrites supported shell commands using its standard filters, including searches.
Native file-reading tools are not rewritten. Differences in tool choice between
harnesses are part of this experiment. RTK recall reads count toward total usage.

The released RTK binary does not contain its development branch's Codex hook.
The small [Codex](hooks/codex.py) and [OpenCode](hooks/opencode.ts) adapters instead
call the same released `rtk rewrite` processor. Both handle its documented 0 and 3
rewrite exit codes and audit eligibility and application. No global `rtk init`
is run. An RTK benchmark run without any hook calls is not eligible; a smoke test
also requires at least one applied rewrite.

## Accounting and interpretation

A local relay forwards native requests and holds upstream credentials outside
the agent filesystem. Codex uses Responses with both providers. OpenCode uses
Responses for CPA and Chat Completions for OpenRouter. No protocol-translation
router is added. Requests for a different model are rejected. OpenRouter vendor
fallback is disabled and required parameters are requested; explicit provider
routing can be added under `providers.openrouter.routing` in the matrix.

The relay records every forwarded request, including title generation and
retries. It requests streaming usage for Chat Completions. It uses the final
cumulative usage per request, never sums repeated streaming snapshots, and never
adds reasoning tokens a second time to output tokens. Missing usage remains
unknown and makes a run ineligible for primary efficiency comparisons.

Reported USD and estimated USD are separate columns. Estimates use the frozen
OpenRouter public retail rates in [pricing.json](pricing.json), including reported
cache reads, cache writes and long-context tiers. CPA estimates describe the
retail API equivalent, not a subscription charge. Missing cache details and any
pricing assumptions are recorded per request. Failed or interrupted requests
without usage can have unobserved cost; reported subtotals are not complete bills.

Wall time covers CLI startup through exit, including hooks, tools and retries.
Evaluation time is separate. Per-request upstream timings are also retained.
Provider response model/provider IDs are captured when reported. Session
isolation does not flush upstream caches or control provider load. Read cached
input separately and inspect provider changes before attributing a latency or
cost difference to a prompt or tool.

Compare medians and ranges within each model and harness before comparing across
harnesses. Three runs per cell are exploratory, not a significance claim. Do not
rank a condition on tokens alone if it has fewer eligible completions. All failed
attempts remain visible and contribute to resource totals. The task is one
workload, not evidence that every model or programming task behaves the same way.

## Isolation and verification

Each agent gets a fresh workspace, HOME, Codex home and XDG directories inside
bubblewrap. Only the system runtime, read-only harness binaries, its writable
workspace/home and the selected RTK adapter are mounted. Host projects, personal
skills, credentials and the evaluator are absent. Environment variables are
allowlisted. Agent processes use a separate PID namespace and are killed as a
group on timeout. This uses a shared network namespace for the local relay and is
not containment against deliberately hostile code; local network services are
still reachable. The task forbids network use, and web/subagent tools are disabled.

Acceptance runs use a fresh evaluator home, the submitted source and read-only
checks. Original tests are copied from the frozen fixture separately, so deleting
or weakening workspace tests cannot remove the regression gate. The evaluator
is deterministic and executes behavior, without an LLM judge.

```bash
python3 bench.py agentbench self-test
python3 bench.py self-test
```

The offline suite checks the 192 active unique cells, isolation and instruction loading
for all 16 harness/condition pairs, RTK rewriting, token/cost accounting, and
acceptance rejection of the original fixture and a broken idempotency mutant.
It also checks that a reference solution passes. The reference is never mounted
into agent runs.

On another Linux x86_64 machine, install OpenCode, the npm Codex distribution,
bubblewrap, Git, Python 3.10+ and system pytest first. Then run
`python3 bench.py agentbench setup`. Setup downloads and verifies the pinned RTK
release and fingerprints the installed harnesses. After a harness update, rerun
setup explicitly and start a new batch. It never edits personal harness settings.

Preparation checks on 2026-09-22: all four final CPA/Luna smoke checks passed,
covering baseline and Ponytail+Caveman+RTK in both harnesses. Outgoing requests
confirmed the selected instruction text and absence of a skill catalog; both RTK
conditions recorded actual rewrites. One OpenCode/Luna baseline task completed
in 309 seconds and passed acceptance plus original regressions, using 289,148
reported tokens (223,232 cached input) and an estimated $0.0296 retail equivalent.
This validates the task and accounting, not comparative performance. It motivated
a 1,000,000-token per-run stopping threshold rather than censoring ordinary
completions at 300,000. OpenRouter inference remains unverified until the dedicated
key is supplied; existing personal OpenRouter credentials were not reused.

After the mixed initial-01 pilot, Kyle stopped the batch and authorized an
OpenCode-only restart with Qwen deferred and a shared 3-million-token threshold.
Use opencode-01 for the new protocol. Existing initial-01 results remain unchanged
as pilot data; do not resume that name under the changed configuration.

## Interrupted batch results

The [opencode-01 analysis](results/opencode-01/ANALYSIS.md) covers 135 finished
attempts, 78 eligible measurements and 103 passing implementations. Results are
preliminary and coverage is uneven. Full per-condition medians and ranges,
exclusion reasons, sanitized run records and source hashes accompany the analysis.

Regenerate the snapshot without inference or runtime setup:

```bash
python3 bench.py agentbench report --batch opencode-01 --output benches/agentbench/results/opencode-01
```

Reporting uses only jobs listed in the batch manifest and rejects inconsistent
job metadata or eligibility. Conditions with no results remain visible. Unknown
costs remain unknown. Raw attempts and the frozen batch protocol are unchanged.
Results exports are excluded from future protocol source snapshots.
