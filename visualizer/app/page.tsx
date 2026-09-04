"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import leaderboardData from "../data/leaderboard.json";
import { useIsMobile } from "../hooks/use-mobile";
import { evidenceSegments } from "./evidence";

type SuiteId = "copybench" | "naturalbench" | "cefrbench";
type Scope = "best" | "all";
type MatrixAxis = "cost" | "tokens" | "latency";

interface Task {
  id: string;
  title: string;
  prompt: string;
}

interface Judgment {
  criteria: Record<string, { score: number; reason: string }>;
  score_5: number;
  score: number;
  brief_ok: boolean;
  realized_cefr: string | null;
  issues: { code: string; category: string; severity: string; evidence: string; explanation: string }[];
  note: string;
}

interface RunItem {
  task_id: string;
  output: string;
  generation: {
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
    latency_ms: number | null;
  };
  score: number;
  judgment: Judgment;
}

interface Run {
  model: string;
  reasoning_effort: string;
  score: number;
  brief_ok_pct: number;
  average_latency_ms: number | null;
  average_input_tokens: number | null;
  average_output_tokens: number | null;
  average_total_tokens: number | null;
  average_cost_usd: number | null;
  cost_basis: "reported" | "estimated" | "unavailable";
  generated: number;
  rated: number;
  total: number;
  evaluation_type: string;
  human_evaluation: boolean;
  generation_file: string;
  file: string;
  items: RunItem[];
}

interface Pricing {
  source: string;
  provider: string;
  retrieved_at: string;
  unit: string;
}

interface Leaderboard {
  benchmark: string;
  score_scale: number;
  generated_at: string;
  pricing: Pricing;
  evaluation: {
    id: string;
    type: string;
    protocol_version: string;
    protocol_file: string;
    human_validated: boolean;
    judge: { model: string; reasoning_effort: string };
  };
  suites: Record<SuiteId, {
    name: string;
    score_label: string;
    task_count: number;
    tasks: Task[];
    runs: Run[];
  }>;
}

const data = leaderboardData as unknown as Leaderboard;
const repository = "https://github.com/KyleDerZweite/litebench";
const effortOrder: Record<string, number> = { low: 0, medium: 1, high: 2, xhigh: 3, max: 4 };
const modelColors: Record<string, string> = {
  "gpt-5.6-luna": "#3fa66b",
  "gpt-5.6-terra": "#3fa66b",
  "gpt-5.6-sol": "#3fa66b",
  "gemini-3.8-flash-high": "#54a7f5",
  "z-ai/glm-5.3-flash": "#b58cff",
};

const suites = [
  {
    id: "copybench" as const,
    label: "CopyBench Lite",
  },
  {
    id: "naturalbench" as const,
    label: "NaturalBench Lite",
  },
  {
    id: "cefrbench" as const,
    label: "CEFRBench Lite",
  },
];

function formatNumber(value: number, decimals = 1) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(decimals);
}

function formatScore(value: number) {
  return `${value.toFixed(1)}%`;
}

function compactTokens(value: number | null) {
  if (value === null) return "N/A";
  return value >= 1000 ? `${formatNumber(value / 1000)}k` : Math.round(value).toString();
}

function formatCost(value: number | null) {
  if (value === null) return "N/A";
  if (value > 0 && value < 0.0001) return "<$0.0001";
  return `$${value < 0.01 ? value.toFixed(4) : value.toFixed(3)}`;
}

function runLabel(run: Run) {
  return `${run.model} [${run.reasoning_effort}]`;
}

function runKey(run: Pick<Run, "model" | "reasoning_effort">) {
  return `${run.model}::${run.reasoning_effort}`;
}

function bestByModel(runs: Run[]) {
  const best = new Map<string, Run>();
  for (const run of runs) {
    const current = best.get(run.model);
    const score = run.score;
    const currentScore = current?.score ?? -Infinity;
    if (
      !current ||
      score > currentScore ||
      (score === currentScore && (effortOrder[run.reasoning_effort] ?? 99) < (effortOrder[current.reasoning_effort] ?? 99))
    ) {
      best.set(run.model, run);
    }
  }
  return [...best.values()];
}

function ModelMark({ model }: { model: string }) {
  return <i aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: modelColors[model] || "#888" }} />;
}

function LiteMark() {
  return (
    <div className="relative grid h-14 w-14 rotate-[-4deg] place-items-center border-2 border-white text-sm font-black tracking-tight text-orange-500 shadow-[0_0_35px_rgb(249_115_22_/_0.12)]">
      LB
    </div>
  );
}

function ScopeToggle({ value, onChange }: { value: Scope; onChange: (scope: Scope) => void }) {
  return (
    <div className="flex border border-neutral-800 font-mono text-[10px] uppercase">
      {(["best", "all"] as Scope[]).map((scope) => (
        <button
          aria-pressed={value === scope}
          className={`px-3 py-2 ${value === scope ? "bg-neutral-100 text-black" : "text-neutral-500 hover:text-white"}`}
          key={scope}
          onClick={() => onChange(scope)}
          type="button"
        >
          {scope === "best" ? "Best observed effort" : "All effort levels"}
        </button>
      ))}
    </div>
  );
}

function ModelFilter({ runs, selected, onChange }: {
  runs: Run[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const models = [...new Set(runs.map((run) => run.model))].sort();
  const allKeys = runs.map(runKey);

  return (
    <details className="model-filter relative z-30">
      <summary className="flex cursor-pointer items-center gap-2 border border-neutral-800 bg-neutral-900/50 px-4 py-2 font-mono text-[10px] uppercase text-neutral-300 hover:bg-neutral-900">
        Configs [{allKeys.filter((key) => selected.has(key)).length}/{allKeys.length}]
        <span aria-hidden="true" className="text-neutral-600">⌄</span>
      </summary>
      <div className="absolute left-0 right-auto top-[calc(100%+.5rem)] w-[min(23rem,calc(100vw-2rem))] border border-neutral-800 bg-neutral-950 shadow-2xl sm:left-auto sm:right-0">
        <div className="max-h-[min(28rem,40vh)] overflow-y-auto p-2">
          {models.map((model) => {
            const modelRuns = runs.filter((run) => run.model === model);
            const modelKeys = modelRuns.map(runKey);
            const selectedCount = modelKeys.filter((key) => selected.has(key)).length;
            const allSelected = selectedCount === modelKeys.length;
            const someSelected = selectedCount > 0 && !allSelected;

            return (
              <div className="border-b border-white/5 px-2 py-3 last:border-0" key={model}>
                <div className="flex items-center gap-2.5">
                  <button
                    aria-checked={allSelected ? true : someSelected ? "mixed" : false}
                    aria-label={`${allSelected ? "Deselect" : "Select"} all ${model} configurations`}
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded-[2px] border text-[10px] ${selectedCount ? "border-neutral-200 bg-neutral-100 text-black" : "border-neutral-800 text-transparent"}`}
                    onClick={() => {
                      const next = new Set(selected);
                      modelKeys.forEach((key) => allSelected ? next.delete(key) : next.add(key));
                      onChange(next);
                    }}
                    role="checkbox"
                    type="button"
                  >
                    {someSelected ? "−" : "✓"}
                  </button>
                  <ModelMark model={model} />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-300">{model}</span>
                  <span className="font-mono text-[10px] text-neutral-600">{selectedCount}/{modelRuns.length}</span>
                </div>
                <div className="ml-6 mt-2 flex flex-wrap gap-1.5">
                  {modelRuns.map((run) => {
                    const key = runKey(run);
                    const active = selected.has(key);
                    return (
                      <button
                        aria-label={`${model} ${run.reasoning_effort} reasoning`}
                        aria-pressed={active}
                        className={`border px-2 py-1 font-mono text-[9px] uppercase tracking-wide ${active ? "border-neutral-500 bg-white/[.035] text-neutral-200" : "border-neutral-800 text-neutral-600 hover:border-neutral-600 hover:text-neutral-300"}`}
                        key={run.reasoning_effort}
                        onClick={() => {
                          const next = new Set(selected);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          onChange(next);
                        }}
                        type="button"
                      >
                        {run.reasoning_effort}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex border-t border-neutral-800 p-2">
          <button className="flex-1 py-2 font-mono text-[10px] uppercase text-neutral-500 hover:text-white" onClick={() => onChange(new Set(allKeys))} type="button">Select all</button>
          <button className="flex-1 py-2 font-mono text-[10px] uppercase text-neutral-500 hover:text-white" onClick={() => onChange(new Set())} type="button">Clear</button>
        </div>
      </div>
    </details>
  );
}

function MatrixTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  return (
    <div className="chart-tooltip">
      <strong>{point?.label}</strong>
      <div>Astra indicator: {formatScore(point?.score)}</div>
      <div>Brief met: {formatScore(point?.briefOkPct)}</div>
      <div>{point?.axisLabel}: {point?.xDisplay}</div>
      <div>{point?.costBasis} generation cost: {formatCost(point?.cost)}</div>
      <div>Output: {compactTokens(point?.outputTokens)} tok</div>
      <div>Latency: {point?.latency == null ? "N/A" : `${formatNumber(point.latency / 1000, 2)}s`}</div>
    </div>
  );
}

function MatrixPoint({ activeModel, cx, cy, fill, maxX, mobile, onModelHover, payload }: any) {
  const point = <circle cx={cx} cy={cy} fill={fill} r={activeModel === payload.model ? 5 : 3.5} />;
  if (mobile || !payload.highlight) {
    return <g onMouseEnter={() => onModelHover(payload.model)}>{point}</g>;
  }
  const nearRight = maxX > 0 && payload.x <= maxX * 0.18;
  const nearLeft = maxX > 0 && payload.x >= maxX * 0.82;
  const textAnchor = nearRight ? "end" : nearLeft ? "start" : "middle";
  const labelX = cx + (nearRight ? -8 : nearLeft ? 8 : 0);
  const labelY = cy + (["gpt-5.6-terra", "z-ai/glm-5.3-flash"].includes(payload.model) ? 18 : -13);
  return (
    <g onMouseEnter={() => onModelHover(payload.model)}>
      {point}
      <text fill={fill} fontFamily="var(--font-sans)" fontSize={12} fontWeight={600} textAnchor={textAnchor} x={labelX} y={labelY}>
        <tspan x={labelX}>{payload.model}</tspan>
        <tspan fontFamily="var(--font-mono)" fontSize={7} fontWeight={500} letterSpacing=".08em" x={labelX} dy={9}>
          {payload.reasoningEffort.toUpperCase()}
        </tspan>
      </text>
    </g>
  );
}

function PerformanceChart({ runs, configurations, mobile, axis, onAxisChange, selectedConfigurations, onConfigurationsChange, scoreLabel, hoveredModel, onModelHover }: {
  runs: Run[];
  configurations: Run[];
  mobile: boolean;
  axis: MatrixAxis;
  onAxisChange: (axis: MatrixAxis) => void;
  selectedConfigurations: Set<string>;
  onConfigurationsChange: (configurations: Set<string>) => void;
  scoreLabel: string;
  hoveredModel: string | null;
  onModelHover: (model: string | null) => void;
}) {
  const axisDefinition = {
    cost: { label: "Avg cost per task", value: (run: Run) => run.average_cost_usd, format: (value: number) => value === 0 ? "$0" : mobile ? `$${value.toFixed(3)}` : formatCost(value) },
    tokens: { label: "Avg output tokens per task", value: (run: Run) => run.average_output_tokens, format: (value: number) => compactTokens(value) },
    latency: { label: "Avg latency per task", value: (run: Run) => run.average_latency_ms === null ? null : run.average_latency_ms / 1000, format: (value: number) => `${formatNumber(value, 2)}s` },
  }[axis];
  const groups = [...new Set(runs.map((run) => run.model))].map((model) => {
    const points = runs
      .filter((run) => run.model === model)
      .map((run) => {
        const x = axisDefinition.value(run);
        return x === null ? null : {
          x,
          score: run.score,
          briefOkPct: run.brief_ok_pct,
          label: runLabel(run),
          axisLabel: axisDefinition.label,
          xDisplay: axisDefinition.format(x),
          cost: run.average_cost_usd,
          costBasis: run.cost_basis,
          outputTokens: run.average_output_tokens,
          latency: run.average_latency_ms,
          effort: effortOrder[run.reasoning_effort] ?? 99,
          model: run.model,
          reasoningEffort: run.reasoning_effort,
        };
      })
      .filter((point): point is NonNullable<typeof point> => point !== null)
      .sort((a, b) => a.effort - b.effort);
    const highlight = points.reduce((best, point) => !best || point.score > best.score ? point : best, points[0]);
    return {
      model,
      color: modelColors[model] || "#888",
      points: points.map((point) => ({ ...point, highlight: point === highlight })),
    };
  });
  const maxX = Math.max(0, ...groups.flatMap((group) => group.points.map((point) => point.x)));
  const orderedGroups = hoveredModel
    ? groups.slice().sort((a, b) => Number(a.model === hoveredModel) - Number(b.model === hoveredModel))
    : groups;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex border border-neutral-800 font-mono text-[10px] uppercase">
          {(["cost", "tokens", "latency"] as MatrixAxis[]).map((option) => (
            <button
              aria-pressed={axis === option}
              className={`px-3 py-2 ${axis === option ? "bg-neutral-100 text-black" : "text-neutral-500 hover:text-white"}`}
              key={option}
              onClick={() => onAxisChange(option)}
              type="button"
            >
              {option === "cost" ? "Cost" : option === "tokens" ? "Output tokens" : "Latency"}
            </button>
          ))}
        </div>
        <ModelFilter onChange={onConfigurationsChange} runs={configurations} selected={selectedConfigurations} />
      </div>
      <section className="border border-neutral-800 bg-[#151515] p-4 sm:p-6">
        <h3 className="mb-1 text-sm font-semibold text-neutral-200">{scoreLabel}</h3>
        <div className="h-[390px] w-full sm:h-[540px]">
          <ResponsiveContainer height="100%" width="100%">
            <ScatterChart margin={{ top: 32, right: mobile ? 6 : 18, bottom: 42, left: mobile ? -10 : 4 }} onMouseLeave={() => onModelHover(null)}>
              <CartesianGrid stroke="rgba(255,255,255,.13)" />
              <XAxis
                axisLine={{ stroke: "rgba(255,255,255,.16)" }}
                dataKey="x"
                domain={[0, (value: number) => value === 0 ? 1 : value * 1.08]}
                label={{ value: axisDefinition.label, position: "insideBottom", offset: -29, fill: "#d4d4d4", fontFamily: "var(--font-sans)", fontSize: 12 }}
                reversed
                tick={{ fill: "#999", fontFamily: "var(--font-sans)", fontSize: 11 }}
                tickFormatter={axisDefinition.format}
                tickLine={false}
                type="number"
              />
              <YAxis
                axisLine={false}
                dataKey="score"
                domain={[0, 100]}
                tick={{ fill: "#999", fontFamily: "var(--font-sans)", fontSize: 11 }}
                tickFormatter={(value) => `${value}%`}
                tickLine={false}
                type="number"
              />
              <Tooltip content={<MatrixTooltip />} cursor={{ stroke: "rgba(255,255,255,.15)", strokeDasharray: "3 3" }} />
              {orderedGroups.map((group) => {
                const dimmed = hoveredModel !== null && hoveredModel !== group.model;
                const color = dimmed ? "#484848" : group.color;
                return (
                <Scatter
                  data={group.points}
                  fill={color}
                  key={group.model}
                  line={{ stroke: color, strokeWidth: hoveredModel === group.model ? 2.5 : 1.5 }}
                  name={group.model}
                  onMouseEnter={() => onModelHover(group.model)}
                  onMouseLeave={() => onModelHover(null)}
                  opacity={dimmed ? 0.38 : 1}
                  shape={<MatrixPoint activeModel={hoveredModel} maxX={maxX} mobile={mobile} onModelHover={onModelHover} />}
                />
                );
              })}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-4 font-mono text-[10px] uppercase text-neutral-500 sm:hidden">
          {groups.map((group) => <span className="flex items-center gap-2" key={group.model}><i className="h-2 w-2 rounded-full" style={{ background: group.color }} />{group.model}</span>)}
        </div>
      </section>
    </div>
  );
}

function TaskBrowser({ runs, tasks, selectedRun, onSelectRun }: {
  runs: Run[];
  tasks: Task[];
  selectedRun: string;
  onSelectRun: (key: string) => void;
}) {
  const [taskId, setTaskId] = useState(tasks[0]?.id || "");
  const [showHighlights, setShowHighlights] = useState(true);
  const [copyStatus, setCopyStatus] = useState("");
  const run = runs.find((entry) => runKey(entry) === selectedRun) || runs[0];
  const task = tasks.find((entry) => entry.id === taskId) || tasks[0];
  const item = run?.items.find((entry) => entry.task_id === task?.id);
  const judgment = item?.judgment;
  if (!run || !task) return null;

  return (
    <section className="mb-10 scroll-mt-4 border border-neutral-800 bg-[#111] p-4 sm:p-6" id="read-answers" tabIndex={-1}>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">Read it for yourself</h2>
        <span className="font-mono text-[10px] uppercase text-orange-400">Demo outputs · unedited</span>
      </div>
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 font-mono text-[10px] uppercase text-neutral-400">
          Prompt
          <select className="w-full min-w-0 border border-neutral-700 bg-neutral-950 px-3 py-3 text-xs normal-case text-neutral-100" onChange={(event) => { setTaskId(event.target.value); setCopyStatus(""); }} value={task.id}>
            {tasks.map((entry, index) => <option key={entry.id} value={entry.id}>{index + 1}. {entry.title}</option>)}
          </select>
        </label>
        <label className="grid gap-2 font-mono text-[10px] uppercase text-neutral-400">
          Answer from
          <select className="w-full min-w-0 border border-neutral-700 bg-neutral-950 px-3 py-3 text-xs normal-case text-neutral-100" onChange={(event) => { onSelectRun(event.target.value); setCopyStatus(""); }} value={runKey(run)}>
            {runs.map((entry) => <option key={runKey(entry)} value={runKey(entry)}>{runLabel(entry)}</option>)}
          </select>
        </label>
      </div>
      <p className="mb-4 text-xs leading-5 text-neutral-400">Keep the prompt selected and switch answers to compare. The highlights are Astra's criticisms under my draft criteria. Decide which ones matter to you.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="min-w-0 border border-white/5 bg-black/20 p-4">
          <h3 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-neutral-400">Input · {task.title}</h3>
          <div className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-300">{task.prompt}</div>
        </article>
        <article className="min-w-0 border border-white/5 bg-black/20 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">Original answer</h3>
            {item && <div className="flex flex-wrap gap-3 text-xs text-neutral-300">
              <label className="flex cursor-pointer items-center gap-2"><input checked={showHighlights} onChange={(event) => setShowHighlights(event.target.checked)} type="checkbox" />Highlights</label>
              <button className="underline underline-offset-4 hover:text-orange-400" onClick={async () => {
                try { await navigator.clipboard.writeText(item.output); setCopyStatus("Copied original answer"); }
                catch { setCopyStatus("Copy failed. Select the answer text to copy it."); }
              }} type="button">Copy answer</button>
            </div>}
          </div>
          {item ? <div className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-200" data-original-answer>
            {showHighlights && judgment ? evidenceSegments(item.output, judgment.issues.map((issue) => issue.evidence)).map((segment, index) =>
              segment.issues.length ? <mark className="evidence-mark" key={index}><a aria-describedby={segment.issues.map((issue) => `astra-issue-${issue}`).join(" ")} href={`#astra-issue-${segment.issues[0]}`}>{segment.text}</a></mark> : <span key={index}>{segment.text}</span>
            ) : item.output}
          </div> : <p className="text-sm text-neutral-400">No answer is available for this configuration and prompt.</p>}
          <p aria-live="polite" className="mt-2 text-xs text-neutral-400">{copyStatus}</p>
          {item && <p className="mt-3 font-mono text-[10px] text-neutral-500">{compactTokens(item.generation.input_tokens)} input tokens · {compactTokens(item.generation.output_tokens)} output tokens · {item.generation.latency_ms === null ? "N/A" : `${formatNumber(item.generation.latency_ms / 1000, 2)}s`}</p>}
        </article>
      </div>

      {item && judgment && <div className="mt-5 border-t border-white/5 pt-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-mono text-xs uppercase text-neutral-300">Astra xhigh assessment</h3>
          <span className="font-mono text-sm text-orange-400">{formatScore(item.score)} <span className="text-xs text-neutral-500">personal fit indicator</span></span>
        </div>
        <p className="text-sm leading-6 text-neutral-300">{judgment.note}</p>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-neutral-400">
          <span>Brief {judgment.brief_ok ? "met" : "flagged"}</span>
          {judgment.realized_cefr && <span>Estimated level {judgment.realized_cefr}</span>}
          <span>AI assessment · not yet reviewed by Kyle</span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {judgment.issues.map((issue, index) => <article className="issue-card border border-orange-500/20 bg-orange-500/[.035] p-4" id={`astra-issue-${index}`} key={index} tabIndex={-1}>
            <h4 className="font-mono text-[10px] uppercase text-orange-400">Astra flagged · {issue.category} · {issue.severity}</h4>
            <p className="mt-2 text-xs font-medium text-neutral-200">{issue.code.replace(/_/g, " ")}</p>
            {issue.evidence ? <blockquote className="mt-2 whitespace-pre-wrap break-words border-l border-orange-500/40 pl-3 text-sm text-neutral-300">{issue.evidence}</blockquote> : <p className="mt-2 text-xs text-neutral-500">Missing from the answer; no passage to highlight.</p>}
            <p className="mt-2 text-sm leading-6 text-neutral-400">{issue.explanation}</p>
          </article>)}
          {!judgment.issues.length && <p className="text-sm text-neutral-400">Astra did not flag a specific passage. You may still disagree with its assessment.</p>}
        </div>

        <details className="mt-5 border border-white/10 p-4">
          <summary className="cursor-pointer text-sm text-neutral-300">Criterion scores and reasons · 0 to 5</summary>
          <p className="mt-3 text-xs leading-5 text-neutral-400">The percentage is the mean criterion score divided by 5. It is a rubric index, not a probability of success. Natural style includes the unslop guidance and contributes to the score.</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {Object.entries(judgment.criteria).map(([criterion, rating]) => <div key={criterion}>
              <dt className="flex items-center justify-between gap-3 text-sm text-neutral-200"><span>{criterion.replace(/_/g, " ")}</span><span className="font-mono">{rating.score}/5</span></dt>
              <dd className="mt-1 text-xs leading-5 text-neutral-400">{rating.reason}</dd>
            </div>)}
          </dl>
        </details>
      </div>}
      {item && !judgment && <p className="mt-5 text-sm text-neutral-400">The new Astra assessment is not available for this answer yet.</p>}
      <div className="mt-5 flex flex-wrap gap-4 font-mono text-[10px] uppercase">
        <a className="text-neutral-400 underline underline-offset-4 hover:text-orange-400" href={`${repository}/blob/main/${run.generation_file}`} rel="noreferrer" target="_blank">Original generation JSON</a>
        <a className="text-neutral-400 underline underline-offset-4 hover:text-orange-400" href={`${repository}/blob/main/${run.file}`} rel="noreferrer" target="_blank">Assessment JSON</a>
        <a className="text-neutral-400 underline underline-offset-4 hover:text-orange-400" href={`${repository}/blob/main/${data.evaluation.protocol_file}`} rel="noreferrer" target="_blank">Criteria and judging protocol</a>
      </div>
    </section>
  );
}

function LeaderboardTable({ runs, scope, onScopeChange, onModelHover, onInspect }: {
  runs: Run[];
  scope: Scope;
  onScopeChange: (scope: Scope) => void;
  onModelHover: (model: string | null) => void;
  onInspect: (run: Run) => void;
}) {
  const rows = (scope === "best" ? bestByModel(runs) : runs)
    .slice()
    .sort((a, b) => b.score - a.score);

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ScopeToggle onChange={onScopeChange} value={scope} />
        <span className="font-mono text-[9px] uppercase text-neutral-600">{rows.length} configurations</span>
      </div>
      <div className="overflow-x-auto border border-white/5 bg-neutral-900/30">
        <table className="w-full min-w-[860px] border-collapse font-mono text-[11px]">
          <thead className="text-[9px] uppercase text-neutral-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Model</th>
              <th className="px-3 py-3 text-right font-medium">Personal fit</th>
              <th className="px-3 py-3 text-right font-medium">Brief met</th>
              <th className="px-3 py-3 text-right font-medium">Avg cost</th>
              <th className="px-3 py-3 text-right font-medium">Out tok</th>
              <th className="px-3 py-3 text-right font-medium">Latency</th>
              <th className="px-4 py-3 text-right font-medium">Inspect</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((run) => (
              <tr
                className="border-t border-white/5 text-neutral-400 hover:bg-white/[.025]"
                key={runKey(run)}
                onMouseEnter={() => onModelHover(run.model)}
                onMouseLeave={() => onModelHover(null)}
              >
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2 text-neutral-200">
                    <ModelMark model={run.model} />
                    <span>{run.model}</span>
                    <span className="text-neutral-600">[{run.reasoning_effort}]</span>
                  </span>
                  <span className="mt-2 block h-1.5 overflow-hidden bg-neutral-900">
                    <span className="block h-full" style={{ background: modelColors[run.model] || "#888", width: `${run.score}%` }} />
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-bold text-neutral-100">
                  {formatScore(run.score)}
                </td>
                <td className="px-3 py-3 text-right">{formatScore(run.brief_ok_pct)}</td>
                <td className="px-3 py-3 text-right" title={`${run.cost_basis} generation cost`}>{formatCost(run.average_cost_usd)}</td>
                <td className="px-3 py-3 text-right">{compactTokens(run.average_output_tokens)}</td>
                <td className="px-3 py-3 text-right">{run.average_latency_ms === null ? "N/A" : `${formatNumber(run.average_latency_ms / 1000, 2)}s`}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    aria-controls="read-answers"
                    aria-label={`Read answers from ${runLabel(run)}`}
                    className="uppercase text-neutral-500 hover:text-orange-500"
                    onClick={() => onInspect(run)}
                    type="button"
                  >
                    Read answers
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function LiteBenchVisualizer() {
  const mobile = useIsMobile();
  const configurations = useMemo(() => {
    const unique = new Map<string, Run>();
    Object.values(data.suites).forEach((entry) => entry.runs.forEach((run) => unique.set(runKey(run), run)));
    return [...unique.values()].sort((a, b) => a.model.localeCompare(b.model) || (effortOrder[a.reasoning_effort] ?? 99) - (effortOrder[b.reasoning_effort] ?? 99));
  }, []);
  const [selectedConfigurations, setSelectedConfigurations] = useState(() => new Set(configurations.map(runKey)));
  const [suiteId, setSuiteId] = useState<SuiteId>("copybench");
  const [scope, setScope] = useState<Scope>("best");
  const [axis, setAxis] = useState<MatrixAxis>("cost");
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  const [inspectedRun, setInspectedRun] = useState("");
  const suite = suites.find((item) => item.id === suiteId) || suites[0];
  const suiteData = data.suites[suiteId];
  const filtered = suiteData.runs.filter((run) => selectedConfigurations.has(runKey(run)));
  const suiteModelCount = new Set(suiteData.runs.map((run) => run.model)).size;
  const suiteRunCount = suiteData.runs.length;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#050505] text-neutral-100 selection:bg-orange-500/30">
      <div className="noise-overlay" />
      <div className="grid-background pointer-events-none absolute inset-0" />

      <header className="relative z-10 mx-auto max-w-7xl border-b border-white/5 px-4 pb-7 pt-10">
        <div className="flex flex-wrap items-end justify-between gap-7">
          <div className="flex items-center gap-5">
            <LiteMark />
            <div>
              <h1 className="stencil-text text-4xl leading-none tracking-tighter sm:text-6xl">LITE<span className="text-orange-500">BENCH</span></h1>
              <p className="mt-2 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-neutral-500">
                <span className="h-2 w-2 rounded-full bg-orange-500" />
                Suite / {suite.label}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 font-mono text-[10px] uppercase text-neutral-500">
            <div className="flex gap-4"><span>Models: {suiteModelCount}</span><span>Runs: {suiteRunCount}</span></div>
            <span>Astra xhigh · AI assessment</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8">
        <section className="mb-8 max-w-3xl">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-orange-400">Kyle's personal writing bench · work in progress</p>
          <p className="text-lg leading-7 text-neutral-200">These are the writing tasks and qualities I care about. Read the prompts, compare the answers, and make your own call.</p>
          <p className="mt-3 text-sm leading-6 text-neutral-400">The current generations are demo material while I build this page and find flaws in the workflow. Astra's scores are an early indicator under my draft criteria. I haven't reviewed these assessments yet.</p>
        </section>
        <nav aria-label="LiteBench suites" className="mb-8 flex flex-wrap gap-2 border-b border-white/5 pb-4">
          {suites.map((item) => (
            <button
              aria-current={suiteId === item.id ? "page" : undefined}
              className={`border px-4 py-2 font-mono text-[10px] uppercase ${suiteId === item.id ? "border-orange-500 bg-orange-500/10 text-orange-400" : "border-neutral-800 text-neutral-500 hover:text-white"}`}
              key={item.id}
              onClick={() => {
                setSuiteId(item.id);
                setHoveredModel(null);
              }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <TaskBrowser key={suiteId} onSelectRun={setInspectedRun} runs={suiteData.runs} selectedRun={inspectedRun} tasks={suiteData.tasks} />
        <h2 className="mb-2 text-xl font-semibold text-neutral-100">Demo results</h2>
        <p className="mb-5 text-sm leading-6 text-neutral-400">Percentages summarize Astra's 0 to 5 criterion ratings. They show fit to this rubric, not a pass probability or a general model ranking. {suiteId === "cefrbench" && "Level and style fit is a provisional estimate for the requested audience, not a CEFR certificate."}</p>
        {filtered.length === 0 ? (
          <section className="glass-card grid min-h-[350px] place-items-center p-6 text-center font-mono text-xs uppercase text-neutral-600">
            <div>
              <p>Select at least one configuration for this suite</p>
              <div className="mt-4 flex justify-center gap-2">
                <ModelFilter onChange={setSelectedConfigurations} runs={configurations} selected={selectedConfigurations} />
                <button className="border border-neutral-800 px-4 py-2 text-neutral-300 hover:border-neutral-600" onClick={() => setSelectedConfigurations(new Set(configurations.map(runKey)))} type="button">Select all</button>
              </div>
            </div>
          </section>
        ) : (
          <>
            <PerformanceChart
              axis={axis}
              configurations={configurations}
              hoveredModel={hoveredModel}
              mobile={mobile}
              onAxisChange={setAxis}
              onConfigurationsChange={setSelectedConfigurations}
              onModelHover={setHoveredModel}
              runs={filtered}
              scoreLabel={suiteData.score_label}
              selectedConfigurations={selectedConfigurations}
            />
            <LeaderboardTable onInspect={(run) => {
              setInspectedRun(runKey(run));
              const browser = document.getElementById("read-answers");
              browser?.focus({ preventScroll: true });
              browser?.scrollIntoView({ block: "start" });
            }} onModelHover={setHoveredModel} onScopeChange={setScope} runs={filtered} scope={scope} />
          </>
        )}
      </main>

      <footer className="relative z-10 mx-auto flex max-w-7xl justify-end border-t border-white/5 px-4 py-6 font-mono text-[9px] uppercase tracking-wider text-neutral-700">
        <span><a className="hover:text-orange-500" href="https://github.com/T3-Content/skatebench" rel="noreferrer" target="_blank">SkateBench design</a>, MIT · <a className="hover:text-orange-500" href={repository} rel="noreferrer" target="_blank">Source</a></span>
      </footer>
      <div className="scanline" />
    </div>
  );
}
