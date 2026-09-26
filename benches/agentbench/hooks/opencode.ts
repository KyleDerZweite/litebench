// Same native rewrite engine as the Codex adapter. Exit 3 supplies a rewrite
// that would ordinarily request approval; these externally isolated runs allow tools.
import { appendFileSync } from "node:fs";
export default async ({ $ }) => ({
  "tool.execute.before": async (input, output) => {
    if (!["bash", "shell"].includes(String(input.tool).toLowerCase())) return;
    const command = output.args?.command;
    if (typeof command !== "string") return;
    const result = await $`rtk rewrite ${command}`.quiet().nothrow();
    const rewritten = String(result.stdout).trim();
    const applied = [0, 3].includes(result.exitCode) && !!rewritten && rewritten !== command;
    appendFileSync("/home/bench/rtk/hooks.jsonl", JSON.stringify({command, rewritten, applied, exit_code: result.exitCode}) + "\n");
    if (applied) output.args.command = rewritten;
  }
});
