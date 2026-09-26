"use client";

import Link from "next/link";
import { useState } from "react";
import summary from "../../../benches/agentbench/results/opencode-01/summary.json";
import coverage from "../../../benches/agentbench/results/opencode-01/coverage.json";
import snapshot from "../../../benches/agentbench/results/opencode-01/runs.json";

type Metric = { median: number; min: number; max: number } | null;
const source = "https://github.com/KyleDerZweite/litebench/tree/main/benches/agentbench/results/opencode-01";
const models = [...new Set(summary.map(row => row.model))].sort();
const conditions = ["baseline", "ponytail", "caveman", "ponytail+caveman", "rtk", "ponytail+rtk", "caveman+rtk", "ponytail+caveman+rtk"];
const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 0 });
const money = (value: number) => `$${value.toFixed(5)}`;
const delta = (value: number | null) => value === null ? "N/A" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
function Stat({ value, cost = false }: { value: Metric; cost?: boolean }) {
  if (!value) return <span className="text-neutral-500">No data</span>;
  const format = cost ? money : number;
  return <><span>{format(value.median)}</span><span className="block text-xs text-neutral-500">{format(value.min)} to {format(value.max)}</span></>;
}

export default function AgentBench() {
  const [model, setModel] = useState("gpt-5.6-luna");
  const rows = summary.filter(row => row.model === model).sort((a, b) => conditions.indexOf(a.condition) - conditions.indexOf(b.condition));
  const runs = snapshot.runs.filter(run => run.job.model.id === model);
  const cpa = runs[0]?.job.model.provider === "cpa";
  const orCost = snapshot.runs.filter(run => run.job.model.provider === "openrouter").reduce((sum, run) => sum + run.upstream.cost_usd_reported_subtotal, 0);
  const cpaCost = snapshot.runs.filter(run => run.job.model.provider === "cpa").reduce((sum, run) => sum + run.upstream.estimated_cost_usd_reported_subtotal, 0);
  return <main className="mx-auto max-w-7xl px-4 py-10 text-neutral-200">
    <Link href="/" className="text-sm text-orange-400 hover:underline">← LiteBench writing benchmarks</Link>
    <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
      <div><p className="font-mono text-xs uppercase tracking-widest text-orange-400">Fourth benchmark · OpenCode · opencode-01</p><h1 className="mt-3 text-4xl font-semibold">Do agent skills save tokens?</h1></div>
      <span className="border border-orange-500/40 px-3 py-2 text-xs text-orange-300">Interrupted experiment · preliminary results</span>
    </div>
    <p className="mt-5 max-w-3xl leading-7 text-neutral-400">One autonomous SQLite coding task, eight instruction/tool conditions, up to three runs per model and condition. Compare the resources needed to pass the same acceptance and regression tests. Total tokens include input across every turn, cached input and output.</p>
    <div className="my-8 grid grid-cols-2 gap-3 md:grid-cols-4">
      {[["Finished / planned", `${coverage.finished} / ${coverage.planned}`], ["Eligible measurements", String(coverage.eligible)], ["Passing implementations", String(coverage.code_pass)], ["Unstarted", String(coverage.unstarted.length)]].map(([label, value]) => <div className="border border-neutral-800 p-4" key={label}><p className="text-xs text-neutral-400">{label}</p><p className="mt-2 text-3xl tabular-nums">{value}</p></div>)}
    </div>
    <section className="mb-8 border-l-2 border-orange-500 pl-5 leading-7">
      <h2 className="text-xl">What the Luna runs suggest</h2>
      <p className="mt-2 text-neutral-400">Caveman used 10% fewer median tokens; RTK used 7% fewer but took 26% longer. All three together used 60% more tokens. All 16 Luna runs passed. With only 1–3 measurements per condition and overlapping ranges, these are observations, not proven savings. Baseline remains a sensible default.</p>
    </section>
    <label htmlFor="agent-model" className="mb-2 block text-sm">Compare conditions within a model</label>
    <select id="agent-model" value={model} onChange={event => setModel(event.target.value)} className="mb-4 w-full max-w-xl border border-neutral-700 bg-neutral-900 p-3 text-sm">
      {models.map(name => <option key={name}>{name}</option>)}
    </select>
    <p className="mb-4 text-sm text-neutral-400">{runs.length} attempts · {runs.filter(run => run.eligible).length} eligible · {runs.filter(run => run.code_pass).length} code-pass. Cells show median, then min to max. Changes compare eligible medians with this model’s baseline. Lower is better.</p>
    <div className="overflow-x-auto border border-neutral-800">
      <table className="w-full min-w-[1000px] text-left text-sm tabular-nums">
        <caption className="sr-only">Condition resource use for {model}</caption>
        <thead className="bg-neutral-900 text-xs text-neutral-400"><tr>{["Condition", "Eligible / attempts", "Total tokens", "Token change", "Seconds", "Time change", cpa ? "Estimated USD" : "Reported USD", "Cost change"].map(label => <th scope="col" className="p-3" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr className="border-t border-neutral-800" key={row.condition}>
          <th scope="row" className="p-3 font-medium">{row.condition}</th><td className="p-3">{row.eligible} / {row.attempts}</td>
          <td className="p-3"><Stat value={row.total_tokens} /></td><td className="p-3">{delta(row.change_percent_vs_baseline.total_tokens)}</td>
          <td className="p-3"><Stat value={row.wall_seconds} /></td><td className="p-3">{delta(row.change_percent_vs_baseline.wall_seconds)}</td>
          <td className="p-3"><Stat value={cpa ? row.estimated_cost_usd : row.cost_usd} cost /></td><td className="p-3">{delta(cpa ? row.change_percent_vs_baseline.estimated_cost_usd : row.change_percent_vs_baseline.cost_usd)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <details className="my-5 border border-neutral-800 p-4"><summary className="cursor-pointer">Input, output and exclusions for {model}</summary>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr>{["Condition", "Input median", "Cached input median", "Output median", "Exclusions (overlap)"].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.condition} className="border-t border-neutral-800"><th className="p-2 text-left font-normal">{row.condition}</th><td className="p-2">{row.input_tokens ? number(row.input_tokens.median) : "N/A"}</td><td className="p-2">{row.cached_input_tokens ? number(row.cached_input_tokens.median) : "N/A"}</td><td className="p-2">{row.output_tokens ? number(row.output_tokens.median) : "N/A"}</td><td className="p-2">{Object.entries(row.exclusions).map(([reason, count]) => `${reason.replaceAll("_", " ")}: ${count}`).join(", ") || "None"}</td></tr>)}</tbody></table></div>
    </details>
    <div className="mt-10 grid gap-8 md:grid-cols-2">
      <section><h2 className="text-xl">Cost across all attempts</h2><p className="mt-3 leading-7 text-neutral-400">OpenRouter reported subtotal: <span className="text-white">{money(orCost)}</span>. CPA retail-equivalent estimate: <span className="text-white">{money(cpaCost)}</span>, separate from OpenRouter charges. Both include failed attempts and input/output costs. Cached input receives its applicable price; reasoning is already included in output.</p><p className="mt-3 text-sm leading-6 text-neutral-400">Some requests lack accounting, so reported subtotals are not a complete invoice. Free endpoints reported zero cost. Estimated CPA costs use the frozen pricing snapshot.</p></section>
      <section><h2 className="text-xl">How to read these results</h2><p className="mt-3 leading-7 text-neutral-400">All 135 attempts passed the original regression suite; 32 failed new-feature acceptance. A passing implementation is excluded from efficiency comparisons if the run timed out, accounting was incomplete, requests remained pending or condition delivery failed verification.</p><p className="mt-3 text-sm leading-6 text-neutral-400">Uneven coverage and exclusions can bias comparisons. No Codex comparison is available in this batch. These tests loaded the skill instructions actively; they do not measure skills merely installed but unused.</p></section>
    </div>
    <footer className="mt-10 flex flex-wrap gap-5 border-t border-neutral-800 pt-5 text-sm text-orange-400"><a href={`${source}/ANALYSIS.md`}>Full analysis and protocol</a><a href={`${source}/summary.json`}>Condition data</a><a href={`${source}/runs.json`}>Sanitized runs and provenance</a></footer>
  </main>;
}
