/**
 * Parity batch 4 — scope wiring: the solid plugin's Pre/PostToolUse entries and
 * the tailwindcss plugin's PostToolUse entry now pass their scope to the bin
 * (`hook claude-code solid|tailwindcss`). These tests pin the behavior that
 * wiring enables at the handleHook level: without the scope (the pre-fix
 * "core" default) the gates stay silent; with it they fire.
 */
import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { handleHook } from "../src/runtime/handle";

const root = (): string => mkdtempSync(join(tmpdir(), "fh-b4-"));

/** Run one hook event with the given scope, returning stdout. */
async function run(payload: Record<string, unknown>, cwd: string, scope?: "solid" | "tailwindcss"): Promise<string> {
  return (await handleHook("claude-code", payload, { now: 5000, cwd, scope })).stdout;
}

test("solid scope PreToolUse: Go interface outside internal/interfaces/ -> deny (core scope never fires it)", async () => {
  const cwd = root();
  const goFile = join(cwd, "svc", "foo.go");
  const pre = { hook_event_name: "PreToolUse", session_id: "s1", tool_name: "Write", tool_input: { file_path: goFile, content: "type Foo interface {\n}\n" } };
  process.env.SOLID_PROJECT_TYPE = "go";
  try {
    const denied = await run(pre, cwd, "solid");
    expect(denied).toContain("Interfaces must be in internal/interfaces/");
    expect(JSON.parse(denied).hookSpecificOutput.permissionDecision).toBe("deny");
    // Pre-fix wiring (no scope arg -> core): the solid gate never runs.
    expect(await run(pre, cwd)).not.toContain("Interfaces must be");
  } finally {
    delete process.env.SOLID_PROJECT_TYPE;
  }
});

test("solid scope PostToolUse: on-disk file over SOLID_FILE_LIMIT -> adaptive warn (silent under core)", async () => {
  const cwd = root();
  const file = join(cwd, "big.go");
  writeFileSync(file, Array.from({ length: 10 }, (_, i) => `var x${i} = ${i}`).join("\n"));
  const post = { hook_event_name: "PostToolUse", session_id: "s1", tool_name: "Write", tool_input: { file_path: file }, tool_response: "ok" };
  process.env.SOLID_PROJECT_TYPE = "go";
  process.env.SOLID_FILE_LIMIT = "5";
  try {
    const warned = await run(post, cwd, "solid");
    expect(warned).toContain("has 10 lines (limit: 5)");
    expect(JSON.parse(warned).hookSpecificOutput.additionalContext).toContain("Consider splitting");
    expect(await run(post, cwd)).not.toContain("limit: 5");
  } finally {
    delete process.env.SOLID_PROJECT_TYPE;
    delete process.env.SOLID_FILE_LIMIT;
  }
});

test("tailwindcss scope PostToolUse: deprecated @tailwind directive in a Tailwind project -> warn (silent under core)", async () => {
  const cwd = root();
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { tailwindcss: "^4.0.0" } }));
  const css = join(cwd, "styles.css");
  writeFileSync(css, "@tailwind base;\n@tailwind components;\n");
  const post = { hook_event_name: "PostToolUse", session_id: "s1", tool_name: "Write", tool_input: { file_path: css }, tool_response: "ok" };
  const warned = await run(post, cwd, "tailwindcss");
  expect(warned).toContain("@tailwind directives are deprecated");
  expect(JSON.parse(warned).hookSpecificOutput.hookEventName).toBe("PostToolUse");
  // Pre-fix wiring (no scope arg -> bin resolves scope=core): warning never emitted.
  expect(await run(post, cwd)).not.toContain("deprecated");
});

test("solid scope stays inert without a detected project type (SOLID_PROJECT_TYPE unset)", async () => {
  const cwd = root();
  mkdirSync(join(cwd, "svc"));
  const pre = { hook_event_name: "PreToolUse", session_id: "s1", tool_name: "Write", tool_input: { file_path: join(cwd, "svc", "foo.go"), content: "type Foo interface {\n}\n" } };
  delete process.env.SOLID_PROJECT_TYPE;
  expect(await run(pre, cwd, "solid")).not.toContain("Interfaces must be");
});
