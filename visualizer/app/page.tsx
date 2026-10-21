"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import SuiteNavigation, { suites, SuiteId } from "./suite-navigation";
import { useIsMobile } from "../hooks/use-mobile";
import { evidenceSegments } from "./evidence";

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
  issues: {
    code: string;
    category: string;
    severity: string;
    evidence: string;
    explanation: string;
  }[];
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
  suites: Record<
    SuiteId,
    {
      name: string;
      score_label: string;
      task_count: number;
      tasks: Task[];
      runs: Run[];
    }
  >;
}

const data = leaderboardData as unknown as Leaderboard;
const repository = "https://github.com/KyleDerZweite/litebench";
const effortOrder: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  xhigh: 3,
  max: 4,
};
const modelColors: Record<string, string> = {
  "gpt-5.6-luna": "#9b94ee",
  "gpt-5.6-terra": "#d69978",
  "gpt-5.6-sol": "#c5d0da",
  "gemini-3.8-flash-high": "#56ca80",
  "z-ai/glm-5.3-flash": "#94c4ff",
};

function formatNumber(value: number, decimals = 1) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(decimals);
}

function formatScore(value: number) {
  return `${value.toFixed(1)}%`;
}

function compactTokens(value: number | null) {
  if (value === null) return "N/A";
  return value >= 1000
    ? `${formatNumber(value / 1000)}k`
    : Math.round(value).toString();
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
      (score === currentScore &&
        (effortOrder[run.reasoning_effort] ?? 99) <
          (effortOrder[current.reasoning_effort] ?? 99))
    ) {
      best.set(run.model, run);
    }
  }
  return [...best.values()];
}

function ModelMark({ model }: { model: string }) {
  return (
    <i
      aria-hidden="true"
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: modelColors[model] || "#888" }}
    />
  );
}

function ScopeToggle({
  value,
  onChange,
}: {
  value: Scope;
  onChange: (scope: Scope) => void;
}) {
  return (
    <div className="flex border border-neutral-800 text-xs">
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

function ModelFilter({
  runs,
  selected,
  onChange,
  mobileContainer,
}: {
  runs: Run[];
  mobileContainer: HTMLDivElement | null;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const models = [...new Set(runs.map((run) => run.model))].sort();
  const allKeys = runs.map(runKey);
  const count = allKeys.filter((key) => selected.has(key)).length;

  useEffect(() => {
    if (!mobile) setOpen(false);
    if (mobile && open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [mobile, open]);

  const filters = (
    <>
      <div className="filter-heading">
        <h2 id="model-filter-title">
          Models{" "}
          <span>
            {
              models.filter((model) =>
                runs.some(
                  (run) => run.model === model && selected.has(runKey(run)),
                ),
              ).length
            }
          </span>
        </h2>
        <button type="button" onClick={() => onChange(new Set(allKeys))}>
          Reset
        </button>
      </div>
      <label className="model-search">
        <span className="sr-only">Find models</span>
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          placeholder="Find models"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <p className="filter-caption">
        {count} of {allKeys.length} configurations
      </p>
      <div className="model-list">
        {models
          .filter((model) => model.toLowerCase().includes(search.toLowerCase()))
          .map((model) => {
            const modelRuns = runs.filter((run) => run.model === model);
            const keys = modelRuns.map(runKey);
            const selectedCount = keys.filter((key) =>
              selected.has(key),
            ).length;
            const allSelected = selectedCount === keys.length;
            return (
              <div className="model-group" key={model}>
                <button
                  className="model-toggle"
                  type="button"
                  role="checkbox"
                  aria-checked={
                    allSelected ? true : selectedCount ? "mixed" : false
                  }
                  aria-label={`${allSelected ? "Deselect" : "Select"} all ${model} configurations`}
                  onClick={() => {
                    const next = new Set(selected);
                    keys.forEach((key) =>
                      allSelected ? next.delete(key) : next.add(key),
                    );
                    onChange(next);
                  }}
                >
                  <ModelMark model={model} />
                  <span>{model}</span>
                  <span className="model-check" aria-hidden="true">
                    {allSelected ? "✓" : selectedCount ? "−" : "+"}
                  </span>
                </button>
                <div className="effort-options">
                  {modelRuns.map((run) => {
                    const key = runKey(run);
                    return (
                      <button
                        type="button"
                        key={key}
                        aria-pressed={selected.has(key)}
                        aria-label={`${model} ${run.reasoning_effort} reasoning`}
                        onClick={() => {
                          const next = new Set(selected);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          onChange(next);
                        }}
                      >
                        {run.reasoning_effort}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        {!models.some((model) =>
          model.toLowerCase().includes(search.toLowerCase()),
        ) && <p className="filter-caption">No models match your search.</p>}
      </div>
      <div className="filter-actions">
        <button type="button" onClick={() => onChange(new Set(allKeys))}>
          Select all
        </button>
        <button type="button" onClick={() => onChange(new Set())}>
          Clear
        </button>
      </div>
      <p className="filter-note">
        Filters apply to charts and rankings. Original answers remain available
        below.
      </p>
    </>
  );

  return mobile ? (
    <>
      {mobileContainer &&
        createPortal(
          <button
            ref={trigger}
            className="mobile-filter-trigger"
            type="button"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            Models{" "}
            <span>
              {count}/{allKeys.length}
            </span>{" "}
            <span aria-hidden="true">☷</span>
          </button>,
          mobileContainer,
        )}
      <dialog
        className="model-dialog"
        ref={dialog}
        aria-labelledby="model-filter-title"
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
      >
        <div className="dialog-top">
          <span>Filter results</span>
          <button type="button" onClick={() => dialog.current?.close()}>
            Done
          </button>
        </div>
        {filters}
      </dialog>
    </>
  ) : (
    <aside className="model-sidebar" aria-label="Model filters">
      {filters}
    </aside>
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
      <div>
        {point?.axisLabel}: {point?.xDisplay}
      </div>
      <div>
        {point?.costBasis} generation cost: {formatCost(point?.cost)}
      </div>
      <div>Output: {compactTokens(point?.outputTokens)} tok</div>
      <div>
        Latency:{" "}
        {point?.latency == null
          ? "N/A"
          : `${formatNumber(point.latency / 1000, 2)}s`}
      </div>
    </div>
  );
}

function MatrixPoint({
  activeModel,
  cx,
  cy,
  fill,
  maxX,
  mobile,
  onModelHover,
  payload,
}: any) {
  const point = (
    <circle
      cx={cx}
      cy={cy}
      fill={fill}
      r={activeModel === payload.model ? 5 : 3.5}
    />
  );
  if (mobile || !payload.highlight) {
    return <g onMouseEnter={() => onModelHover(payload.model)}>{point}</g>;
  }
  const nearRight = maxX > 0 && payload.x >= maxX * 0.82;
  const nearLeft = maxX > 0 && payload.x <= maxX * 0.18;
  const textAnchor = nearRight ? "end" : nearLeft ? "start" : "middle";
  const labelX = cx + (nearRight ? -8 : nearLeft ? 8 : 0);
  const labelY =
    cy +
    (["gpt-5.6-terra", "z-ai/glm-5.3-flash"].includes(payload.model)
      ? 18
      : -13);
  return (
    <g onMouseEnter={() => onModelHover(payload.model)}>
      {point}
      <text
        fill={fill}
        fontFamily="var(--font-sans)"
        fontSize={12}
        fontWeight={600}
        textAnchor={textAnchor}
        x={labelX}
        y={labelY}
      >
        <tspan x={labelX}>{payload.model}</tspan>
        <tspan
          fontFamily="var(--font-mono)"
          fontSize={7}
          fontWeight={500}
          letterSpacing=".08em"
          x={labelX}
          dy={9}
        >
          {payload.reasoningEffort.toUpperCase()}
        </tspan>
      </text>
    </g>
  );
}

function PerformanceChart({
  runs,
  mobile,
  axis,
  onAxisChange,
  scoreLabel,
  hoveredModel,
  onModelHover,
}: {
  runs: Run[];
  mobile: boolean;
  axis: MatrixAxis;
  onAxisChange: (axis: MatrixAxis) => void;
  scoreLabel: string;
  hoveredModel: string | null;
  onModelHover: (model: string | null) => void;
}) {
  const axisDefinition = {
    cost: {
      label: "Avg cost per task",
      value: (run: Run) => run.average_cost_usd,
      format: (value: number) =>
        value === 0
          ? "$0"
          : mobile
            ? `$${value.toFixed(3)}`
            : formatCost(value),
    },
    tokens: {
      label: "Avg output tokens per task",
      value: (run: Run) => run.average_output_tokens,
      format: (value: number) => compactTokens(value),
    },
    latency: {
      label: "Avg latency per task",
      value: (run: Run) =>
        run.average_latency_ms === null ? null : run.average_latency_ms / 1000,
      format: (value: number) => `${formatNumber(value, 2)}s`,
    },
  }[axis];
  const groups = [...new Set(runs.map((run) => run.model))].map((model) => {
    const points = runs
      .filter((run) => run.model === model)
      .map((run) => {
        const x = axisDefinition.value(run);
        return x === null
          ? null
          : {
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
    const highlight = points.reduce(
      (best, point) => (!best || point.score > best.score ? point : best),
      points[0],
    );
    return {
      model,
      color: modelColors[model] || "#888",
      points: points.map((point) => ({
        ...point,
        highlight: point === highlight,
      })),
    };
  });
  const maxX = Math.max(
    0,
    ...groups.flatMap((group) => group.points.map((point) => point.x)),
  );
  const orderedGroups = hoveredModel
    ? groups
        .slice()
        .sort(
          (a, b) =>
            Number(a.model === hoveredModel) - Number(b.model === hoveredModel),
        )
    : groups;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex border border-neutral-800 text-xs">
          {(["cost", "tokens", "latency"] as MatrixAxis[]).map((option) => (
            <button
              aria-pressed={axis === option}
              className={`px-3 py-2 ${axis === option ? "bg-neutral-100 text-black" : "text-neutral-500 hover:text-white"}`}
              key={option}
              onClick={() => onAxisChange(option)}
              type="button"
            >
              {option === "cost"
                ? "Cost"
                : option === "tokens"
                  ? "Output tokens"
                  : "Latency"}
            </button>
          ))}
        </div>
      </div>
      <section
        className="performance-chart"
        aria-label="Writing score comparison"
      >
        <h3 className="mb-1 text-sm font-semibold text-neutral-200">
          {scoreLabel}
        </h3>
        <div className="chart-canvas">
          <ResponsiveContainer height="100%" width="100%">
            <ScatterChart
              margin={{
                top: 32,
                right: mobile ? 6 : 18,
                bottom: 42,
                left: mobile ? -10 : 4,
              }}
              onMouseLeave={() => onModelHover(null)}
            >
              <CartesianGrid
                stroke="#25211e"
                strokeDasharray="2 6"
                vertical={false}
              />
              <XAxis
                axisLine={{ stroke: "rgba(255,255,255,.16)" }}
                dataKey="x"
                domain={[
                  0,
                  (value: number) => (value === 0 ? 1 : value * 1.08),
                ]}
                label={{
                  value: axisDefinition.label,
                  position: "insideBottom",
                  offset: -29,
                  fill: "#d4d4d4",
                  fontFamily: "var(--font-sans)",
                  fontSize: 12,
                }}
                tick={{
                  fill: "#999",
                  fontFamily: "var(--font-sans)",
                  fontSize: 11,
                }}
                tickFormatter={axisDefinition.format}
                tickLine={false}
                type="number"
              />
              <YAxis
                axisLine={false}
                dataKey="score"
                domain={[0, 100]}
                tick={{
                  fill: "#999",
                  fontFamily: "var(--font-sans)",
                  fontSize: 11,
                }}
                tickFormatter={(value) => `${value}%`}
                tickLine={false}
                type="number"
              />
              <Tooltip
                content={<MatrixTooltip />}
                cursor={{
                  stroke: "rgba(255,255,255,.15)",
                  strokeDasharray: "3 3",
                }}
              />
              {orderedGroups.map((group) => {
                const dimmed =
                  hoveredModel !== null && hoveredModel !== group.model;
                const color = dimmed ? "#484848" : group.color;
                return (
                  <Scatter
                    isAnimationActive={false}
                    data={group.points}
                    fill={color}
                    key={group.model}
                    line={{
                      stroke: color,
                      strokeWidth: hoveredModel === group.model ? 2.5 : 2,
                    }}
                    name={group.model}
                    onMouseEnter={() => onModelHover(group.model)}
                    onMouseLeave={() => onModelHover(null)}
                    opacity={dimmed ? 0.38 : 1}
                    shape={
                      <MatrixPoint
                        activeModel={hoveredModel}
                        maxX={maxX}
                        mobile={mobile}
                        onModelHover={onModelHover}
                      />
                    }
                  />
                );
              })}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-legend">
          {groups.map((group) => (
            <span className="flex items-center gap-2" key={group.model}>
              <i
                className="h-2 w-2 rounded-full"
                style={{ background: group.color }}
              />
              {group.model}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function TaskBrowser({
  runs,
  tasks,
  selectedRun,
  onSelectRun,
}: {
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
    <section className="answer-browser" id="read-answers" tabIndex={-1}>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">Read it for yourself</h2>
        <span className="text-xs text-orange-400">Demo outputs · unedited</span>
      </div>
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-xs text-neutral-400">
          Prompt
          <select
            aria-label="Prompt"
            className="w-full min-w-0 border border-neutral-700 bg-neutral-950 px-3 py-3 text-xs normal-case text-neutral-100"
            onChange={(event) => {
              setTaskId(event.target.value);
              setCopyStatus("");
            }}
            value={task.id}
          >
            {tasks.map((entry, index) => (
              <option key={entry.id} value={entry.id}>
                {index + 1}. {entry.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-xs text-neutral-400">
          Answer from
          <select
            aria-label="Answer from"
            className="w-full min-w-0 border border-neutral-700 bg-neutral-950 px-3 py-3 text-xs normal-case text-neutral-100"
            onChange={(event) => {
              onSelectRun(event.target.value);
              setCopyStatus("");
            }}
            value={runKey(run)}
          >
            {runs.map((entry) => (
              <option key={runKey(entry)} value={runKey(entry)}>
                {runLabel(entry)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mb-4 text-xs leading-5 text-neutral-400">
        Keep the prompt selected and switch answers to compare. The highlights
        are Astra's criticisms under my draft criteria. Decide which ones matter
        to you.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="min-w-0 border border-neutral-800 bg-transparent p-4">
          <h3 className="mb-3 text-xs  text-neutral-400">
            Input · {task.title}
          </h3>
          <div className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-300">
            {task.prompt}
          </div>
        </article>
        <article className="min-w-0 border border-neutral-800 bg-transparent p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs  text-neutral-400">Original answer</h3>
            {item && (
              <div className="flex flex-wrap gap-3 text-xs text-neutral-300">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    checked={showHighlights}
                    onChange={(event) =>
                      setShowHighlights(event.target.checked)
                    }
                    type="checkbox"
                  />
                  Highlights
                </label>
                <button
                  className="underline underline-offset-4 hover:text-orange-400"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(item.output);
                      setCopyStatus("Copied original answer");
                    } catch {
                      setCopyStatus(
                        "Copy failed. Select the answer text to copy it.",
                      );
                    }
                  }}
                  type="button"
                >
                  Copy answer
                </button>
              </div>
            )}
          </div>
          {item ? (
            <div
              className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-200"
              data-original-answer
            >
              {showHighlights && judgment
                ? evidenceSegments(
                    item.output,
                    judgment.issues.map((issue) => issue.evidence),
                  ).map((segment, index) =>
                    segment.issues.length ? (
                      <mark className="evidence-mark" key={index}>
                        <a
                          aria-describedby={segment.issues
                            .map((issue) => `astra-issue-${issue}`)
                            .join(" ")}
                          href={`#astra-issue-${segment.issues[0]}`}
                        >
                          {segment.text}
                        </a>
                      </mark>
                    ) : (
                      <span key={index}>{segment.text}</span>
                    ),
                  )
                : item.output}
            </div>
          ) : (
            <p className="text-sm text-neutral-400">
              No answer is available for this configuration and prompt.
            </p>
          )}
          <p aria-live="polite" className="mt-2 text-xs text-neutral-400">
            {copyStatus}
          </p>
          {item && (
            <p className="mt-3 text-xs text-neutral-500">
              {compactTokens(item.generation.input_tokens)} input tokens ·{" "}
              {compactTokens(item.generation.output_tokens)} output tokens ·{" "}
              {item.generation.latency_ms === null
                ? "N/A"
                : `${formatNumber(item.generation.latency_ms / 1000, 2)}s`}
            </p>
          )}
        </article>
      </div>

      {item && judgment && (
        <div className="mt-5 border-t border-neutral-800 pt-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-xs text-neutral-300">Astra xhigh assessment</h3>
            <span className="text-sm text-orange-400">
              {formatScore(item.score)}{" "}
              <span className="text-xs text-neutral-500">
                personal fit indicator
              </span>
            </span>
          </div>
          <p className="text-sm leading-6 text-neutral-300">{judgment.note}</p>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-neutral-400">
            <span>Brief {judgment.brief_ok ? "met" : "flagged"}</span>
            {judgment.realized_cefr && (
              <span>Estimated level {judgment.realized_cefr}</span>
            )}
            <span>AI assessment · not yet reviewed by Kyle</span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {judgment.issues.map((issue, index) => (
              <article
                className="issue-card border border-orange-500/20 bg-orange-500/[.035] p-4"
                id={`astra-issue-${index}`}
                key={index}
                tabIndex={-1}
              >
                <h4 className="text-xs text-orange-400">
                  Astra flagged · {issue.category} · {issue.severity}
                </h4>
                <p className="mt-2 text-xs font-medium text-neutral-200">
                  {issue.code.replace(/_/g, " ")}
                </p>
                {issue.evidence ? (
                  <blockquote className="mt-2 whitespace-pre-wrap break-words border-l border-orange-500/40 pl-3 text-sm text-neutral-300">
                    {issue.evidence}
                  </blockquote>
                ) : (
                  <p className="mt-2 text-xs text-neutral-500">
                    Missing from the answer; no passage to highlight.
                  </p>
                )}
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  {issue.explanation}
                </p>
              </article>
            ))}
            {!judgment.issues.length && (
              <p className="text-sm text-neutral-400">
                Astra did not flag a specific passage. You may still disagree
                with its assessment.
              </p>
            )}
          </div>

          <details className="mt-5 border border-white/10 p-4">
            <summary className="cursor-pointer text-sm text-neutral-300">
              Criterion scores and reasons · 0 to 5
            </summary>
            <p className="mt-3 text-xs leading-5 text-neutral-400">
              The percentage is the mean criterion score divided by 5. It is a
              rubric index, not a probability of success. Natural style includes
              the unslop guidance and contributes to the score.
            </p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {Object.entries(judgment.criteria).map(([criterion, rating]) => (
                <div key={criterion}>
                  <dt className="flex items-center justify-between gap-3 text-sm text-neutral-200">
                    <span>{criterion.replace(/_/g, " ")}</span>
                    <span className="font-mono">{rating.score}/5</span>
                  </dt>
                  <dd className="mt-1 text-xs leading-5 text-neutral-400">
                    {rating.reason}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      )}
      {item && !judgment && (
        <p className="mt-5 text-sm text-neutral-400">
          The new Astra assessment is not available for this answer yet.
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-4 text-xs">
        <a
          className="text-neutral-400 underline underline-offset-4 hover:text-orange-400"
          href={`${repository}/blob/main/${run.generation_file}`}
          rel="noreferrer"
          target="_blank"
        >
          Original generation JSON
        </a>
        <a
          className="text-neutral-400 underline underline-offset-4 hover:text-orange-400"
          href={`${repository}/blob/main/${run.file}`}
          rel="noreferrer"
          target="_blank"
        >
          Assessment JSON
        </a>
        <a
          className="text-neutral-400 underline underline-offset-4 hover:text-orange-400"
          href={`${repository}/blob/main/${data.evaluation.protocol_file}`}
          rel="noreferrer"
          target="_blank"
        >
          Criteria and judging protocol
        </a>
      </div>
    </section>
  );
}

function LeaderboardTable({
  runs,
  scope,
  onScopeChange,
  onModelHover,
  onInspect,
}: {
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
    <section className="ranking-section" aria-labelledby="ranking-title">
      <h2 id="ranking-title">Configurations</h2>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ScopeToggle onChange={onScopeChange} value={scope} />
        <span className="text-xs text-neutral-500">
          {rows.length} configurations
        </span>
      </div>
      <div className="overflow-x-auto border border-neutral-800 bg-neutral-900/30">
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
          <thead className="text-xs text-neutral-500">
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
                className="border-t border-neutral-800 text-neutral-400 hover:bg-white/[.025]"
                key={runKey(run)}
                onMouseEnter={() => onModelHover(run.model)}
                onMouseLeave={() => onModelHover(null)}
              >
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2 text-neutral-200">
                    <ModelMark model={run.model} />
                    <span>{run.model}</span>
                    <span className="text-neutral-500">
                      [{run.reasoning_effort}]
                    </span>
                  </span>
                  <span className="mt-2 block h-1.5 overflow-hidden bg-neutral-900">
                    <span
                      className="block h-full"
                      style={{
                        background: modelColors[run.model] || "#888",
                        width: `${run.score}%`,
                      }}
                    />
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-bold text-neutral-100">
                  {formatScore(run.score)}
                </td>
                <td className="px-3 py-3 text-right">
                  {formatScore(run.brief_ok_pct)}
                </td>
                <td
                  className="px-3 py-3 text-right"
                  title={`${run.cost_basis} generation cost`}
                >
                  {formatCost(run.average_cost_usd)}
                </td>
                <td className="px-3 py-3 text-right">
                  {compactTokens(run.average_output_tokens)}
                </td>
                <td className="px-3 py-3 text-right">
                  {run.average_latency_ms === null
                    ? "N/A"
                    : `${formatNumber(run.average_latency_ms / 1000, 2)}s`}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    aria-controls="read-answers"
                    aria-label={`Read answers from ${runLabel(run)}`}
                    className="text-neutral-400 hover:text-orange-500"
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
    Object.values(data.suites).forEach((entry) =>
      entry.runs.forEach((run) => unique.set(runKey(run), run)),
    );
    return [...unique.values()].sort(
      (a, b) =>
        a.model.localeCompare(b.model) ||
        (effortOrder[a.reasoning_effort] ?? 99) -
          (effortOrder[b.reasoning_effort] ?? 99),
    );
  }, []);
  const [mobileContainer, setMobileContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const [selectedConfigurations, setSelectedConfigurations] = useState(
    () => new Set(configurations.map(runKey)),
  );
  const [suiteId, setSuiteId] = useState<SuiteId>("copybench");
  const [scope, setScope] = useState<Scope>("best");
  const [axis, setAxis] = useState<MatrixAxis>("cost");
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  const [inspectedRun, setInspectedRun] = useState("");
  const suiteData = data.suites[suiteId];
  const filtered = suiteData.runs.filter((run) =>
    selectedConfigurations.has(runKey(run)),
  );
  const suiteModelCount = new Set(suiteData.runs.map((run) => run.model)).size;
  const suiteRunCount = suiteData.runs.length;

  return (
    <div className="results-layout">
      <main className="results-main" id="main-content">
        <div className="results-toolbar">
          <SuiteNavigation
            value={suiteId}
            onChange={(value) => {
              setSuiteId(value);
              setHoveredModel(null);
            }}
          />
          <a className="read-link" href="#read-answers">
            Read the answers <span aria-hidden="true">↗</span>
          </a>
        </div>
        <section className="results-intro">
          <div>
            <p className="eyebrow">
              Writing benchmarks · Astra xhigh annotations
            </p>
            <h1>{suites.find((suite) => suite.id === suiteId)?.label}</h1>
          </div>
          <p className="result-counts">
            <span>{suiteModelCount} models</span>
            <span>{suiteRunCount} configurations</span>
            <span>{suiteData.tasks.length} prompts</span>
          </p>
        </section>
        <p className="results-context">
          Kyle's personal writing rubric. These preserved generations are demo
          material, not a current model ranking. Read the original answers and
          decide for yourself.
        </p>
        <div className="mobile-filter-slot" ref={setMobileContainer} />
        {filtered.length === 0 ? (
          <section className="empty-results">
            <h2>No configurations selected</h2>
            <p>Select a model or reasoning level to compare results.</p>
            <button
              className="primary-button"
              onClick={() =>
                setSelectedConfigurations(new Set(configurations.map(runKey)))
              }
              type="button"
            >
              Select all configurations
            </button>
          </section>
        ) : (
          <>
            <PerformanceChart
              axis={axis}
              hoveredModel={hoveredModel}
              mobile={mobile}
              onAxisChange={setAxis}
              onModelHover={setHoveredModel}
              runs={filtered}
              scoreLabel={suiteData.score_label}
            />
            <LeaderboardTable
              onInspect={(run) => {
                setInspectedRun(runKey(run));
                const browser = document.getElementById("read-answers");
                browser?.focus({ preventScroll: true });
                browser?.scrollIntoView({ block: "start", behavior: "smooth" });
              }}
              onModelHover={setHoveredModel}
              onScopeChange={setScope}
              runs={filtered}
              scope={scope}
            />
          </>
        )}
        <details className="methodology">
          <summary>About these results</summary>
          <p>
            Percentages summarize Astra's 0 to 5 criterion ratings. They show
            fit to this draft rubric, not a pass probability or a general model
            ranking. Kyle has not reviewed these AI assessments.
          </p>
          <p>
            Costs and latency describe the preserved generation calls. Costs may
            be estimates. Best observed effort selects the highest-scoring
            configuration in this batch, which favors lucky results.
          </p>
          {suiteId === "cefrbench" && (
            <p>
              Level and style fit is a provisional estimate for the requested
              audience, not a CEFR certificate.
            </p>
          )}
        </details>
        <TaskBrowser
          key={suiteId}
          onSelectRun={setInspectedRun}
          runs={suiteData.runs}
          selectedRun={inspectedRun}
          tasks={suiteData.tasks}
        />
      </main>
      <ModelFilter
        mobileContainer={mobileContainer}
        onChange={setSelectedConfigurations}
        runs={configurations}
        selected={selectedConfigurations}
      />
    </div>
  );
}
