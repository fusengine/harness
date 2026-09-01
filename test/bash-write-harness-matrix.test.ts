import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleHook } from "../src/runtime/handle";

const ids = ["claude-code", "codex", "cursor", "kimi"] as const;

function payload(id: typeof ids[number], command: string, cwd: string): Record<string, unknown> {
  const session_id = `matrix-${id}-${randomUUID()}`;
  if (id === "cursor") return { hook_event_name: "beforeShellExecution", session_id, command, cwd };
  return { hook_event_name: "PreToolUse", session_id, tool_use_id: randomUUID(), cwd, tool_name: "Bash", tool_input: { command } };
}

function decision(id: typeof ids[number], stdout: string): string {
  if (!stdout) return "allow";
  const parsed = JSON.parse(stdout) as { permission?: string; hookSpecificOutput?: { permissionDecision?: string } };
  return id === "cursor" ? parsed.permission ?? "allow" : parsed.hookSpecificOutput?.permissionDecision ?? "allow";
}

test("shared shell verdict matrix stays stable across Claude, Codex, Cursor, and Kimi", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "fh-shell-matrix-cwd-"));
  const home = mkdtempSync(join(tmpdir(), "fh-shell-matrix-home-"));
  const cases = [
    { command: "rg '->between' fichier.php", expected: ["allow", "allow", "allow", "allow"] },
    { command: "echo x > result.ts", expected: ["deny", "deny", "deny", "deny"] },
    { command: "echo x > result.log", expected: ["ask", "deny", "deny", "deny"] },
  ] as const;
  for (const row of cases) {
    const actual = await Promise.all(ids.map(async (id) => decision(id, (await handleHook(id, payload(id, row.command, cwd), { now: 1000, cwd, home })).stdout)));
    expect(actual, row.command).toEqual([...row.expected]);
  }
});
