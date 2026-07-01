import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { handleHook, type HandleOptions } from "../src/runtime/handle";

/** Fresh throwaway project root per call. */
const root = (): string => mkdtempSync(join(tmpdir(), "fh-b4-solid-"));

/** A PreToolUse Write payload (claude-code shape). */
const preWrite = (sid: string, filePath: string, content: string) => ({
  hook_event_name: "PreToolUse",
  session_id: sid,
  tool_name: "Write",
  tool_input: { file_path: filePath, content },
});

test("solid scope: clean Write allows WITHOUT falling through to the core gate chain", async () => {
  // Control: the SAME payload under the core scope IS denied by the APEX
  // freshness gate ("explore") — proving the core gate() chain fires on it.
  const payload = preWrite("s-b4-solid", "a.ts", "a\nb\nc\nd\ne\nf");
  const core = await handleHook("claude-code", payload, { now: 5000, cwd: root() });
  expect(core.stdout).toContain("explore");

  // Solid scope, no SOLID violation: plain allow with EMPTY stdout — the
  // branch must return BEFORE gate(), else core-guards + solid both wiring
  // PreToolUse Write|Edit would run the core APEX chain twice per edit.
  const prev = process.env.SOLID_PROJECT_TYPE;
  delete process.env.SOLID_PROJECT_TYPE;
  try {
    const opts: HandleOptions = { now: 5000, cwd: root(), scope: "solid" };
    expect(await handleHook("claude-code", payload, opts)).toEqual({ stdout: "", exit: 0 });
  } finally {
    if (prev !== undefined) process.env.SOLID_PROJECT_TYPE = prev;
  }
});

test("solid scope: filePath-less tool (Bash) also allows, never the core chain", async () => {
  // Parity: solid/hooks.json only matches Write|Edit — validate-solid.py never
  // polices Bash. Before the fix the `event.filePath` guard made this payload
  // fall through to gate(), where the git guard denies the destructive push.
  const payload = {
    hook_event_name: "PreToolUse",
    session_id: "s-b4-solid-b",
    tool_name: "Bash",
    tool_input: { command: "git push --force" },
  };
  const out = await handleHook("claude-code", payload, { now: 5000, cwd: root(), scope: "solid" });
  expect(out).toEqual({ stdout: "", exit: 0 });
});

test("solid scope: Go interface outside internal/interfaces/ still denies (validate-solid.py parity)", async () => {
  const prev = process.env.SOLID_PROJECT_TYPE;
  process.env.SOLID_PROJECT_TYPE = "go";
  try {
    const payload = preWrite("s-b4-solid-v", "/proj/store.go", "type Store interface {\n}\n");
    const out = await handleHook("claude-code", payload, { now: 5000, cwd: root(), scope: "solid" });
    const parsed = JSON.parse(out.stdout) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
    };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain("internal/interfaces/");
  } finally {
    if (prev === undefined) delete process.env.SOLID_PROJECT_TYPE;
    else process.env.SOLID_PROJECT_TYPE = prev;
  }
});
