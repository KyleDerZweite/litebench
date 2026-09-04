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

type SuiteId = "copybench" | "naturalbench" | "cefrbench";
type Scope = "best" | "all";
type MatrixAxis = "cost" | "tokens" | "latency";

interface Task {
  id: string;
  title: string;
  prompt: string;
}

interface Judgment {
  score: number;
  brief_ok: boolean;
  realized_cefr: string | null;
  issues: { code: string; evidence: string }[];
  note: string;
}

interface RunItem {
  task_id: string;
  output: string;
  generation: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    latency_ms: number;
  };
  score: number;
  judge_stddev: number;
  brief_ok_votes: number;
  judgments: Record<string, Judgment>;
}

interface Run {
  model: string;
  reasoning_effort: string;
  score: number;
  judge_stddev: number;
  judge_range: number;
  judge_scores: Record<string, number>;
  average_item_judge_stddev: number;
  disagreement_count: number;
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
    human_validated: boolean;
    judges: Record<string, { model: string; reasoning_effort: string; focus: string }>;
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
const effortLevels = ["low", "medium", "high", "xhigh", "max"];
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

const judgeLabels: Record<string, string> = {
  sol_max: "Sol max",
  gemini_high: "Gemini high",
  glm_high: "GLM high",
};

function formatNumber(value: number, decimals = 1) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(decimals);
}

function formatScore(value: number) {
  return value.toFixed(2);
}

function compactTokens(value: number | null) {
  if (value === null) return "N/A";
  return value >= 1000 ? `${formatNumber(value / 1000)}k` : Math.round(value).toString();
}

function formatCost(value: number | null) {
  if (value === null) return "N/A";
  return `$${value < 0.01 ? value.toFixed(4) : value.toFixed(3)}`;
}

function runLabel(run: Run) {
  return `${run.model} [${run.reasoning_effort}]`;
}

function runKey(run: Pick<Run, "model" | "reasoning_effort">) {
  return `${run.model}::${run.reasoning_effort}`;
}

function detailsId(run: Run) {
  return `details-${runKey(run).replace(/[^a-z0-9]+/gi, "-")}`;
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
          {scope === "best" ? "Best" : "All effort levels"}
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
            const available = new Set(modelRuns.map((run) => run.reasoning_effort));

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
                  {effortLevels.map((effort) => {
                    const availableEffort = available.has(effort);
                    const key = `${model}::${effort}`;
                    const active = availableEffort && selected.has(key);
                    return (
                      <button
                        aria-label={`${model} ${effort} reasoning`}
                        aria-pressed={active}
                        className={`border px-2 py-1 font-mono text-[9px] uppercase tracking-wide ${!availableEffort ? "cursor-not-allowed border-neutral-900 text-neutral-800 line-through" : active ? "border-neutral-400 bg-neutral-100 text-black" : "border-neutral-800 text-neutral-600 hover:border-neutral-600 hover:text-neutral-300"}`}
                        disabled={!availableEffort}
                        key={effort}
                        onClick={() => {
                          const next = new Set(selected);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          onChange(next);
                        }}
                        type="button"
                      >
                        {effort}
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
      <div>Score: {formatScore(point?.score)}</div>
      {Object.entries(point?.judgeScores || {}).map(([judge, score]) => (
        <div key={judge}>{judgeLabels[judge] || judge}: {formatScore(score as number)}</div>
      ))}
      <div>Brief OK: {formatScore(point?.briefOkPct)}%</div>
      <div>{point?.axisLabel}: {point?.xDisplay}</div>
      <div>Estimated cost: {formatCost(point?.cost)}</div>
      <div>Output: {compactTokens(point?.outputTokens)} tok</div>
      <div>Latency: {formatNumber(point?.latency / 1000, 2)}s</div>
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
  const labelY = cy + (payload.model === "z-ai/glm-5.3-flash" ? 18 : -13);
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
          judgeScores: run.judge_scores,
          briefOkPct: run.brief_ok_pct,
          label: runLabel(run),
          axisLabel: axisDefinition.label,
          xDisplay: axisDefinition.format(x),
          cost: run.average_cost_usd,
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

function RunDetails({ run, tasks }: { run: Run; tasks: Task[] }) {
  const [taskId, setTaskId] = useState(run.items[0]?.task_id || "");
  const item = run.items.find((entry) => entry.task_id === taskId) || run.items[0];
  const task = tasks.find((entry) => entry.id === item?.task_id);
  if (!item || !task) return null;

  return (
    <section className="mt-3 border border-neutral-800 bg-[#111] p-4 sm:p-6" id={detailsId(run)}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-neutral-100">
            <ModelMark model={run.model} />
            <strong>{run.model}</strong>
            <span className="font-mono text-xs uppercase text-neutral-500">[{run.reasoning_effort}]</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] uppercase text-neutral-500">
            <span>Score {formatScore(run.score)} ±{formatScore(run.judge_stddev)}</span>
            <span>Cost {formatCost(run.average_cost_usd)}</span>
            <span>Output {compactTokens(run.average_output_tokens)} tok</span>
            <span>Latency {run.average_latency_ms === null ? "N/A" : `${formatNumber(run.average_latency_ms / 1000, 2)}s`}</span>
          </div>
        </div>
        <label className="flex items-center gap-2 font-mono text-[9px] uppercase text-neutral-600">
          Task
          <select className="max-w-64 border border-neutral-700 bg-neutral-950 px-3 py-2 text-[10px] normal-case text-neutral-300" onChange={(event) => setTaskId(event.target.value)} value={item.task_id}>
            {run.items.map((entry, index) => (
              <option key={entry.task_id} value={entry.task_id}>{index + 1}. {tasks.find((candidate) => candidate.id === entry.task_id)?.title || entry.task_id}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="border border-white/5 bg-black/20 p-4">
          <h4 className="mb-3 font-mono text-[9px] uppercase tracking-wider text-neutral-600">Input · {task.title}</h4>
          <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-300">{task.prompt}</p>
        </article>
        <article className="border border-white/5 bg-black/20 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-mono text-[9px] uppercase tracking-wider text-neutral-600">Output</h4>
            <span className="font-mono text-[9px] uppercase text-neutral-600">
              {compactTokens(item.generation.input_tokens)} in · {compactTokens(item.generation.output_tokens)} out · {formatNumber(item.generation.latency_ms / 1000, 2)}s
            </span>
          </div>
          <p className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-neutral-200">{item.output}</p>
        </article>
      </div>

      <div className="mt-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="font-mono text-[9px] uppercase tracking-wider text-neutral-600">Judge assessments</h4>
          <span className="font-mono text-[9px] uppercase text-neutral-600">Item score {formatScore(item.score)} ±{formatScore(item.judge_stddev)} · brief OK {item.brief_ok_votes}/3</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {Object.entries(item.judgments).map(([judge, judgment]) => (
            <article className="border border-white/5 bg-black/20 p-4" key={judge}>
              <div className="flex items-center justify-between gap-3">
                <h5 className="font-mono text-[10px] uppercase text-neutral-400">{judgeLabels[judge] || judge}</h5>
                <span className="font-mono text-xs font-bold text-neutral-100">{formatScore(judgment.score)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 font-mono text-[9px] uppercase">
                <span className={judgment.brief_ok ? "text-emerald-500" : "text-orange-500"}>Brief {judgment.brief_ok ? "OK" : "miss"}</span>
                {judgment.realized_cefr && <span className="text-neutral-600">CEFR {judgment.realized_cefr}</span>}
              </div>
              <p className="mt-3 text-xs leading-5 text-neutral-400">{judgment.note}</p>
              {judgment.issues.length > 0 && (
                <ul className="mt-3 space-y-2 border-t border-white/5 pt-3 text-xs leading-5 text-neutral-500">
                  {judgment.issues.map((issue, index) => (
                    <li key={`${issue.code}-${index}`}>
                      <span className="font-mono text-[9px] uppercase text-neutral-600">{issue.code.replace(/_/g, " ")}</span>
                      {issue.evidence && <span className="block text-neutral-400">"{issue.evidence}"</span>}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-4 font-mono text-[9px] uppercase">
        <a className="text-neutral-600 hover:text-orange-500" href={`${repository}/blob/main/${run.generation_file}`} rel="noreferrer" target="_blank">Raw output JSON</a>
        <a className="text-neutral-600 hover:text-orange-500" href={`${repository}/blob/main/${run.file}`} rel="noreferrer" target="_blank">Raw judge JSON</a>
      </div>
    </section>
  );
}

function LeaderboardTable({ runs, tasks, scope, onScopeChange, onModelHover }: {
  runs: Run[];
  tasks: Task[];
  scope: Scope;
  onScopeChange: (scope: Scope) => void;
  onModelHover: (model: string | null) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const rows = (scope === "best" ? bestByModel(runs) : runs)
    .slice()
    .sort((a, b) => b.score - a.score);
  const expandedRun = rows.find((run) => runKey(run) === expanded);

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
              <th className="px-3 py-3 text-right font-medium">Score</th>
              <th className="px-3 py-3 text-right font-medium">Brief OK</th>
              <th className="px-3 py-3 text-right font-medium">Avg cost</th>
              <th className="px-3 py-3 text-right font-medium">Out tok</th>
              <th className="px-3 py-3 text-right font-medium">Latency</th>
              <th className="px-4 py-3 text-right font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((run) => (
              <tr
                className={`border-t border-white/5 text-neutral-400 hover:bg-white/[.025] ${expanded === runKey(run) ? "bg-white/[.035]" : ""}`}
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
                <td className="px-3 py-3 text-right font-bold text-neutral-100" title={Object.entries(run.judge_scores).map(([judge, score]) => `${judgeLabels[judge] || judge}: ${formatScore(score)}`).join("\n")}>
                  {formatScore(run.score)} <span className="font-normal text-neutral-600">±{formatScore(run.judge_stddev)}</span>
                </td>
                <td className="px-3 py-3 text-right">{formatScore(run.brief_ok_pct)}%</td>
                <td className="px-3 py-3 text-right" title={`${run.cost_basis} generation cost`}>{formatCost(run.average_cost_usd)}</td>
                <td className="px-3 py-3 text-right">{compactTokens(run.average_output_tokens)}</td>
                <td className="px-3 py-3 text-right">{run.average_latency_ms === null ? "N/A" : `${formatNumber(run.average_latency_ms / 1000, 2)}s`}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    aria-controls={detailsId(run)}
                    aria-expanded={expanded === runKey(run)}
                    className="uppercase text-neutral-500 hover:text-orange-500"
                    onClick={() => setExpanded(expanded === runKey(run) ? null : runKey(run))}
                    type="button"
                  >
                    {expanded === runKey(run) ? "Close" : "View"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {expandedRun && <RunDetails key={expandedRun.file} run={expandedRun} tasks={tasks} />}
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
            <span>Three-judge AI scores · no human review</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8">
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

        <h2 className="mb-4 text-xl font-semibold text-neutral-100">Leaderboard</h2>
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
            <LeaderboardTable onModelHover={setHoveredModel} onScopeChange={setScope} runs={filtered} scope={scope} tasks={suiteData.tasks} />
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
