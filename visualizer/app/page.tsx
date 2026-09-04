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

interface Run {
  model: string;
  reasoning_effort: string;
  copy_quality: number | null;
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
  file: string;
}

interface Pricing {
  source: string;
  provider: string;
  retrieved_at: string;
  unit: string;
}

interface Leaderboard {
  benchmark: string;
  suite: string;
  task_set: string;
  score_scale: number;
  generated_at: string;
  pricing: Pricing;
  runs: Run[];
}

const data = leaderboardData as Leaderboard;
const repository = "https://github.com/KyleDerZweite/litebench";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const effortOrder: Record<string, number> = { low: 0, medium: 1, high: 2, xhigh: 3, max: 4 };
const modelColors: Record<string, string> = {
  "gpt-5.6-luna": "#5bcf91",
  "gpt-5.6-terra": "#4da3ff",
  "gpt-5.6-sol": "#ff925c",
};

const suites = [
  {
    id: "copybench" as const,
    label: "CopyBench Lite",
    description: "Scores how well the writing follows a copy brief",
    ready: true,
    prompts: "benches/copybench/public.json",
    judge: "benches/copybench/judge-ai-provisional-v0.2.txt",
  },
  {
    id: "naturalbench" as const,
    label: "NaturalBench Lite",
    description: "Checks whether the writing is idiomatic or formulaic",
    ready: false,
    prompts: "benches/naturalbench/public.json",
    judge: "benches/naturalbench/judge.txt",
  },
  {
    id: "cefrbench" as const,
    label: "CEFRBench Lite",
    description: "Checks whether the writing matches the requested CEFR level",
    ready: false,
    prompts: "benches/cefrbench/public.json",
    judge: "benches/cefrbench/judge.txt",
  },
];

function formatNumber(value: number, decimals = 1) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(decimals);
}

function compactTokens(value: number | null) {
  if (value === null) return "N/A";
  return value >= 1000 ? `${formatNumber(value / 1000)}k` : Math.round(value).toString();
}

function formatCost(value: number | null) {
  if (value === null) return "N/A";
  return `$${value < 0.01 ? value.toFixed(4) : value.toFixed(3)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function runLabel(run: Run) {
  return `${run.model} [${run.reasoning_effort}]`;
}

function shortRunLabel(run: Run) {
  return `${run.model.replace("gpt-5.6-", "")} ${run.reasoning_effort}`;
}

function bestByModel(runs: Run[]) {
  const best = new Map<string, Run>();
  for (const run of runs) {
    const current = best.get(run.model);
    const score = run.copy_quality ?? -Infinity;
    const currentScore = current?.copy_quality ?? -Infinity;
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

function ModelLogo({ className = "h-4 w-4" }: { className?: string }) {
  return <img alt="" aria-hidden="true" className={`${className} opacity-80`} src={`${basePath}/assets/logos/openai.svg`} />;
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

function ModelFilter({ models, selected, onChange }: {
  models: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  return (
    <details className="model-filter relative z-30">
      <summary className="cursor-pointer border border-neutral-800 bg-neutral-900/50 px-4 py-2 font-mono text-[10px] uppercase text-neutral-300 hover:bg-neutral-900">
        Models [{selected.size}/{models.length}]
      </summary>
      <div className="absolute right-0 top-[calc(100%+.5rem)] w-72 border border-neutral-800 bg-neutral-950 p-2 shadow-2xl">
        <div className="mb-2 flex border-b border-white/5 pb-2">
          <button className="flex-1 py-2 font-mono text-[10px] uppercase text-neutral-500 hover:text-white" onClick={() => onChange(new Set(models))} type="button">Select all</button>
          <button className="flex-1 py-2 font-mono text-[10px] uppercase text-neutral-500 hover:text-white" onClick={() => onChange(new Set())} type="button">Clear</button>
        </div>
        {models.map((model) => (
          <label className="flex cursor-pointer items-center gap-3 px-2 py-2 font-mono text-xs text-neutral-400 hover:bg-white/5" key={model}>
            <input
              checked={selected.has(model)}
              className="accent-orange-500"
              onChange={() => {
                const next = new Set(selected);
                if (next.has(model)) next.delete(model);
                else next.add(model);
                onChange(next);
              }}
              type="checkbox"
            />
            <ModelLogo />
            <span>{model}</span>
          </label>
        ))}
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
      <div>Score: {formatNumber(point?.score)} / 100</div>
      <div>{point?.axisLabel}: {point?.xDisplay}</div>
      <div>Estimated cost: {formatCost(point?.cost)}</div>
      <div>Output: {compactTokens(point?.outputTokens)} tok</div>
      <div>Latency: {formatNumber(point?.latency / 1000, 2)}s</div>
    </div>
  );
}

function MatrixPoint({ cx, cy, fill, mobile, payload }: any) {
  if (mobile) return <circle cx={cx} cy={cy} fill={fill} r={4} />;
  const offset = payload.effort % 2 === 0 ? -9 : 15;
  return (
    <g>
      <circle cx={cx} cy={cy} fill={fill} r={4} />
      <text fill={fill} fontFamily="var(--font-mono)" fontSize={9} fontWeight={700} textAnchor="middle" x={cx} y={cy + offset}>
        {payload.shortLabel}
      </text>
    </g>
  );
}

function PerformanceChart({ runs, mobile, axis, onAxisChange }: {
  runs: Run[];
  mobile: boolean;
  axis: MatrixAxis;
  onAxisChange: (axis: MatrixAxis) => void;
}) {
  const axisDefinition = {
    cost: { label: "Avg cost", value: (run: Run) => run.average_cost_usd, format: (value: number) => mobile ? `$${value.toFixed(3)}` : formatCost(value) },
    tokens: { label: "Output tokens", value: (run: Run) => run.average_output_tokens, format: (value: number) => compactTokens(value) },
    latency: { label: "Latency", value: (run: Run) => run.average_latency_ms === null ? null : run.average_latency_ms / 1000, format: (value: number) => `${formatNumber(value, 2)}s` },
  }[axis];
  const groups = [...new Set(runs.map((run) => run.model))].map((model) => ({
    model,
    color: modelColors[model] || "#888",
    points: runs
      .filter((run) => run.model === model)
      .map((run) => {
        const x = axisDefinition.value(run);
        return x === null || run.copy_quality === null ? null : {
          x,
          score: run.copy_quality,
          label: runLabel(run),
          shortLabel: shortRunLabel(run),
          axisLabel: axisDefinition.label,
          xDisplay: axisDefinition.format(x),
          cost: run.average_cost_usd,
          outputTokens: run.average_output_tokens,
          latency: run.average_latency_ms,
          effort: effortOrder[run.reasoning_effort] ?? 99,
          model: run.model,
        };
      })
      .filter((point): point is NonNullable<typeof point> => point !== null)
      .sort((a, b) => a.effort - b.effort),
  }));

  return (
    <section className="glass-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3 sm:px-6">
        <div className="flex border border-neutral-800 font-mono text-[10px] uppercase">
          {(["cost", "tokens", "latency"] as MatrixAxis[]).map((option) => (
            <button
              aria-pressed={axis === option}
              className={`px-3 py-2 ${axis === option ? "bg-neutral-100 text-black" : "text-neutral-500 hover:text-white"}`}
              key={option}
              onClick={() => onAxisChange(option)}
              type="button"
            >
              {option === "cost" ? "Avg cost" : option === "tokens" ? "Output tokens" : "Latency"}
            </button>
          ))}
        </div>
        <span className="font-mono text-[9px] uppercase text-neutral-600">8 briefs · updated {formatDate(data.generated_at)}</span>
      </div>
      <div className="p-4 sm:p-6">
        <div className="mb-2 flex items-baseline justify-between gap-4">
          <h3 className="text-sm font-semibold text-neutral-200">CopyBench score</h3>
          <span className="font-mono text-[9px] uppercase text-neutral-600">Best value at top right</span>
        </div>
        <div className="h-[470px] w-full">
          <ResponsiveContainer height="100%" width="100%">
            <ScatterChart margin={{ top: 28, right: mobile ? 8 : 68, bottom: 42, left: mobile ? -8 : 12 }}>
              <CartesianGrid stroke="rgba(255,255,255,.08)" />
              <XAxis
                axisLine={false}
                dataKey="x"
                label={{ value: axisDefinition.label.toUpperCase(), position: "insideBottom", offset: -28, fill: "#666", fontFamily: "var(--font-mono)", fontSize: 10 }}
                reversed
                tick={{ fill: "#666", fontFamily: "var(--font-mono)", fontSize: 10 }}
                tickFormatter={axisDefinition.format}
                tickLine={false}
                type="number"
              />
              <YAxis
                axisLine={false}
                dataKey="score"
                domain={[0, 100]}
                label={mobile ? undefined : { value: "SCORE", angle: -90, position: "insideLeft", fill: "#666", fontFamily: "var(--font-mono)", fontSize: 10 }}
                tick={{ fill: "#666", fontFamily: "var(--font-mono)", fontSize: 10 }}
                tickFormatter={(value) => `${value}%`}
                tickLine={false}
                type="number"
              />
              <Tooltip content={<MatrixTooltip />} cursor={{ stroke: "rgba(255,255,255,.15)", strokeDasharray: "3 3" }} />
              {groups.map((group) => (
                <Scatter
                  data={group.points}
                  fill={group.color}
                  key={group.model}
                  line={{ stroke: group.color, strokeWidth: 1.5 }}
                  name={group.model}
                  shape={<MatrixPoint mobile={mobile} />}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-4 font-mono text-[10px] uppercase text-neutral-500">
          {groups.map((group) => <span className="flex items-center gap-2" key={group.model}><i className="h-2 w-2 rounded-full" style={{ background: group.color }} />{group.model}</span>)}
        </div>
      </div>
    </section>
  );
}

function LeaderboardTable({ runs, scope, onScopeChange, models, selectedModels, onModelsChange }: {
  runs: Run[];
  scope: Scope;
  onScopeChange: (scope: Scope) => void;
  models: string[];
  selectedModels: Set<string>;
  onModelsChange: (models: Set<string>) => void;
}) {
  const rows = (scope === "best" ? bestByModel(runs) : runs)
    .slice()
    .sort((a, b) => (b.copy_quality ?? -Infinity) - (a.copy_quality ?? -Infinity));

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ScopeToggle onChange={onScopeChange} value={scope} />
        <div className="flex items-center gap-3">
          <span className="font-mono text-[9px] uppercase text-neutral-600">{rows.length} configurations</span>
          <ModelFilter models={models} onChange={onModelsChange} selected={selectedModels} />
        </div>
      </div>
      <div className="overflow-x-auto border border-white/5 bg-neutral-900/30">
        <table className="w-full min-w-[780px] border-collapse font-mono text-[11px]">
          <thead className="text-[9px] uppercase text-neutral-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Model</th>
              <th className="px-3 py-3 text-right font-medium">Score</th>
              <th className="px-3 py-3 text-right font-medium">Avg cost</th>
              <th className="px-3 py-3 text-right font-medium">Out tok</th>
              <th className="px-3 py-3 text-right font-medium">Latency</th>
              <th className="px-4 py-3 text-right font-medium">Raw</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((run) => (
              <tr className="border-t border-white/5 text-neutral-400 hover:bg-white/[.025]" key={`${run.model}-${run.reasoning_effort}`}>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2 text-neutral-200">
                    <ModelLogo />
                    <span>{run.model}</span>
                    <span className="text-neutral-600">[{run.reasoning_effort}]</span>
                  </span>
                  <span className="mt-2 block h-1.5 overflow-hidden bg-neutral-900">
                    <span className="block h-full" style={{ background: modelColors[run.model] || "#888", width: `${run.copy_quality ?? 0}%` }} />
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-bold text-neutral-100">{run.copy_quality === null ? "N/A" : `${formatNumber(run.copy_quality)} / 100`}</td>
                <td className="px-3 py-3 text-right" title={`${run.cost_basis} generation cost`}>{formatCost(run.average_cost_usd)}</td>
                <td className="px-3 py-3 text-right">{compactTokens(run.average_output_tokens)}</td>
                <td className="px-3 py-3 text-right">{run.average_latency_ms === null ? "N/A" : `${formatNumber(run.average_latency_ms / 1000, 2)}s`}</td>
                <td className="px-4 py-3 text-right"><a className="uppercase text-neutral-600 hover:text-orange-500" href={`${repository}/blob/main/${run.file}`} rel="noreferrer" target="_blank">View</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 font-mono text-[9px] leading-4 text-neutral-700">
        Cost is estimated from recorded token counts using model rates from <a className="hover:text-orange-500" href={data.pricing.source} rel="noreferrer" target="_blank">models.dev</a>, captured {data.pricing.retrieved_at}. It excludes cache discounts, proxy fees, and judge calls.
      </p>
    </section>
  );
}

function PendingSuite({ suite }: { suite: (typeof suites)[number] }) {
  return (
    <section className="glass-card grid min-h-[430px] place-items-center p-8 text-center">
      <div className="max-w-2xl">
        <h2 className="stencil-text text-3xl">{suite.label}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-neutral-500">{suite.description}. CopyBench scores do not count here.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3 font-mono text-[10px] uppercase">
          <a className="border border-neutral-800 px-4 py-3 text-neutral-300 hover:border-neutral-600" href={`${repository}/blob/main/${suite.prompts}`} rel="noreferrer" target="_blank">View prompts</a>
          <a className="border border-neutral-800 px-4 py-3 text-neutral-300 hover:border-neutral-600" href={`${repository}/blob/main/${suite.judge}`} rel="noreferrer" target="_blank">View evaluator</a>
        </div>
      </div>
    </section>
  );
}

export default function LiteBenchVisualizer() {
  const mobile = useIsMobile();
  const models = useMemo(() => [...new Set(data.runs.map((run) => run.model))].sort(), []);
  const [selectedModels, setSelectedModels] = useState(() => new Set(models));
  const [suiteId, setSuiteId] = useState<SuiteId>("copybench");
  const [scope, setScope] = useState<Scope>("best");
  const [axis, setAxis] = useState<MatrixAxis>("cost");
  const suite = suites.find((item) => item.id === suiteId) || suites[0];
  const filtered = data.runs.filter((run) => selectedModels.has(run.model));
  const suiteModelCount = suite.ready ? models.length : 0;
  const suiteRunCount = suite.ready ? data.runs.length : 0;

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
            {suite.ready && <span>Provisional AI scores · no human review</span>}
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
              onClick={() => setSuiteId(item.id)}
              type="button"
            >
              {item.label}{!item.ready && <span className="ml-2 text-neutral-700">0 runs</span>}
            </button>
          ))}
        </nav>

        {!suite.ready ? <PendingSuite suite={suite} /> : (
          <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-xl font-semibold text-neutral-100">Leaderboard</h2>
              <span className="font-mono text-[9px] uppercase text-neutral-600">Score out of 100 · lower cost, tokens, and latency are better</span>
            </div>
            {selectedModels.size === 0 ? (
              <section className="glass-card grid min-h-[350px] place-items-center p-6 text-center font-mono text-xs uppercase text-neutral-600">
                <div>
                  <p>Select at least one model</p>
                  <button className="mt-4 border border-neutral-800 px-4 py-2 text-neutral-300 hover:border-neutral-600" onClick={() => setSelectedModels(new Set(models))} type="button">Select all</button>
                </div>
              </section>
            ) : (
              <>
                <PerformanceChart axis={axis} mobile={mobile} onAxisChange={setAxis} runs={filtered} />
                <LeaderboardTable models={models} onModelsChange={setSelectedModels} onScopeChange={setScope} runs={filtered} scope={scope} selectedModels={selectedModels} />
              </>
            )}
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
