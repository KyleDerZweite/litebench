"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import arenaJson from "../data/arena.json";
import { computeStandings, VoteRecord, VoteWinner } from "./elo";

interface ArenaTask {
  id: string;
  title: string;
  prompt: string;
}

interface ArenaItem {
  task_id: string;
  output: string;
}

interface ArenaConfig {
  config: string;
  model: string;
  reasoning_effort: string;
  generation_file: string;
  items: ArenaItem[];
}

interface ArenaSuite {
  name: string;
  tasks: ArenaTask[];
  configs: ArenaConfig[];
}

const arena = arenaJson as unknown as { generation: string; suites: Record<string, ArenaSuite> };
const STORAGE_KEY = "litebench-arena-votes-v1";

interface Pair {
  taskId: string;
  a: string;
  b: string;
}

function loadVotes(): VoteRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is VoteRecord =>
      typeof entry === "object" && entry !== null &&
      typeof (entry as VoteRecord).a === "string" &&
      typeof (entry as VoteRecord).b === "string" &&
      ((entry as VoteRecord).winner === "a" || (entry as VoteRecord).winner === "b" || (entry as VoteRecord).winner === "tie" || (entry as VoteRecord).winner === "both_bad"),
    );
  } catch {
    return [];
  }
}

function drawPair(suite: ArenaSuite, avoid: string): Pair | null {
  if (suite.tasks.length === 0 || suite.configs.length < 2) return null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const task = suite.tasks[Math.floor(Math.random() * suite.tasks.length)];
    const first = Math.floor(Math.random() * suite.configs.length);
    let second = Math.floor(Math.random() * suite.configs.length);
    if (second === first) second = (second + 1) % suite.configs.length;
    const pair = { taskId: task.id, a: suite.configs[first].config, b: suite.configs[second].config };
    if (`${pair.taskId}${pair.a}${pair.b}` !== avoid) return pair;
  }
  const task = suite.tasks[Math.floor(Math.random() * suite.tasks.length)];
  return { taskId: task.id, a: suite.configs[0].config, b: suite.configs[1].config };
}

export default function ArenaView({ suiteId }: { suiteId: string }) {
  const suite = arena.suites[suiteId];
  const [votes, setVotes] = useState<VoteRecord[]>([]);
  const [pair, setPair] = useState<Pair | null>(null);
  const [revealed, setRevealed] = useState<VoteWinner | null>(null);
  const [notice, setNotice] = useState("");
  const avoidRef = useRef("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setVotes(loadVotes());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(votes));
    } catch {
      setNotice("Browser storage is unavailable, votes will not persist.");
    }
  }, [votes]);

  useEffect(() => {
    avoidRef.current = "";
    setRevealed(null);
    setPair(suite ? drawPair(suite, "") : null);
  }, [suiteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const standings = useMemo(() => {
    if (!suite) return [];
    return computeStandings(suite.configs.map((entry) => entry.config), votes.filter((vote) => vote.suite === suiteId));
  }, [suite, suiteId, votes]);

  if (!suite) return null;

  const task = suite.tasks.find((entry) => entry.id === pair?.taskId) || suite.tasks[0];
  const outputFor = (config: string) =>
    suite.configs.find((entry) => entry.config === config)?.items.find((entry) => entry.task_id === task?.id)?.output || "";

  const next = () => {
    setRevealed(null);
    setPair(drawPair(suite, avoidRef.current));
  };

  const cast = (winner: VoteWinner) => {
    if (!pair || revealed) return;
    avoidRef.current = `${pair.taskId}${pair.a}${pair.b}`;
    setVotes((current) => [...current, { suite: suiteId, taskId: pair.taskId, a: pair.a, b: pair.b, winner, ts: new Date().toISOString() }]);
    setRevealed(winner);
  };

  const exportVotes = () => {
    const blob = new Blob([JSON.stringify(votes, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "litebench-arena-votes.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importVotes = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error("expected a vote list");
      setVotes((current) => [...current, ...(parsed as VoteRecord[]).filter((entry) =>
        entry && typeof entry.a === "string" && typeof entry.b === "string" &&
        (entry.winner === "a" || entry.winner === "b" || entry.winner === "tie" || entry.winner === "both_bad"))]);
      setNotice(`Imported votes from ${file.name}.`);
    } catch {
      setNotice("Import failed. Expected the exported vote JSON.");
    }
  };

  return (
    <div>
      <section className="mb-6 border border-neutral-800 bg-[#111] p-4 sm:p-6">
        <h2 className="mb-4 text-xl font-semibold">Score two answers</h2>
        {!pair || !task ? (
          <p className="text-sm text-neutral-400">Not enough configurations or prompts to run comparisons.</p>
        ) : (
          <>
            <article className="mb-4 border border-white/5 bg-black/20 p-4">
              <h3 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-neutral-400">Prompt · {task.title}</h3>
              <div className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-300">{task.prompt}</div>
            </article>
            <div className="grid gap-4 lg:grid-cols-2">
              {(["a", "b"] as const).map((side) => (
                <article className="flex min-w-0 flex-col border border-white/5 bg-black/20 p-4" key={side}>
                  <h3 className="mb-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-neutral-400">
                    <span>Answer {side.toUpperCase()}</span>
                    {revealed && <span className="normal-case text-orange-400">{pair[side]}</span>}
                  </h3>
                  <div className="min-h-40 flex-1 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-200">
                    {outputFor(pair[side])}
                  </div>
                </article>
              ))}
            </div>
            {revealed ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <p className="text-sm text-neutral-300">
                  {revealed === "tie"
                    ? "Recorded as a tie."
                    : revealed === "both_bad"
                    ? "Recorded: both are bad."
                    : `Recorded: ${revealed === "a" ? pair.a : pair.b} wins.`}
                </p>
                <button className="border border-orange-500 bg-orange-500/10 px-4 py-2 font-mono text-[10px] uppercase text-orange-400 hover:bg-orange-500/20" onClick={next} type="button">
                  Next matchup
                </button>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="border border-neutral-100 bg-neutral-100 px-4 py-2 font-mono text-[10px] uppercase text-black hover:bg-white" onClick={() => cast("a")} type="button">A is better</button>
                <button className="border border-neutral-100 bg-neutral-100 px-4 py-2 font-mono text-[10px] uppercase text-black hover:bg-white" onClick={() => cast("b")} type="button">B is better</button>
                <button className="border border-neutral-700 px-4 py-2 font-mono text-[10px] uppercase text-neutral-300 hover:border-neutral-500" onClick={() => cast("tie")} type="button">Tie</button>
                <button className="border border-neutral-700 px-4 py-2 font-mono text-[10px] uppercase text-neutral-300 hover:border-neutral-500" onClick={() => cast("both_bad")} type="button">Both are bad</button>
                <button className="px-4 py-2 font-mono text-[10px] uppercase text-neutral-500 hover:text-white" onClick={next} type="button">Skip</button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Human rankings</h2>
          <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase">
            <button className="border border-neutral-800 px-3 py-2 text-neutral-300 hover:border-neutral-600" onClick={exportVotes} type="button">Export votes</button>
            <button className="border border-neutral-800 px-3 py-2 text-neutral-300 hover:border-neutral-600" onClick={() => fileRef.current?.click()} type="button">Import votes</button>
            <button
              className="border border-neutral-800 px-3 py-2 text-neutral-500 hover:text-white"
              onClick={() => {
                if (window.confirm("Delete all recorded arena votes in this browser?")) {
                  setVotes([]);
                  next();
                }
              }}
              type="button"
            >
              Reset
            </button>
            <input
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importVotes(file);
                event.target.value = "";
              }}
              ref={fileRef}
              type="file"
            />
          </div>
        </div>
        {notice && <p aria-live="polite" className="mb-3 text-xs text-neutral-400">{notice}</p>}
        <div className="overflow-x-auto border border-white/5 bg-neutral-900/30">
          <table className="w-full min-w-[640px] border-collapse font-mono text-[11px]">
            <thead className="text-[9px] uppercase text-neutral-600">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Configuration</th>
                <th className="px-3 py-3 text-right font-medium">ELO</th>
                <th className="px-3 py-3 text-right font-medium">Votes</th>
                <th className="px-3 py-3 text-right font-medium">W · L · T · Bad</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((entry) => (
                <tr className="border-t border-white/5 text-neutral-400" key={entry.config}>
                  <td className="px-4 py-3 text-neutral-200">{entry.config}</td>
                  <td className="px-3 py-3 text-right font-bold text-neutral-100">{Math.round(entry.rating)}</td>
                  <td className="px-3 py-3 text-right">{entry.votes}</td>
                  <td className="px-3 py-3 text-right">{entry.wins} · {entry.losses} · {entry.ties} · {entry.bad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </section>
    </div>
  );
}
