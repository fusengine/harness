import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOME_DIR, envCandidates, loadDotenv } from "../src/config/dotenv";
import { detectHarness, modeFor } from "../src/detect/harness";
import { guard, toHermesResponse } from "../src/adapters/hermes";
import { resolveMaxLines } from "../src/config/limits";

// Tracks the gate's own resolver (`FUSE_SOLID_MAX_LINES` ?? default) so this
// fixture stays oversized regardless of the ambient env override.
const oversized = "x\n".repeat(resolveMaxLines() + 50);

test("dotenv: hermes home dir is ~/.hermes (ROADMAP item)", () => {
  expect(HOME_DIR.hermes).toBe(".hermes");
  expect(envCandidates("hermes", "/h", "/p")).toEqual(["/h/.hermes/.env", "/p/.env"]);
});

test("dotenv: loadDotenv hydrates from ~/.hermes/.env, never overwrites", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-hermes-home-"));
  mkdirSync(join(home, ".hermes"), { recursive: true });
  writeFileSync(join(home, ".hermes", ".env"), 'export NEURAL_MEMORY_HOST="from-hermes"\nexport GRAPHITI_PORT="8000"\n');
  const cwd = mkdtempSync(join(tmpdir(), "fh-hermes-cwd-"));
  const env: NodeJS.ProcessEnv = { GRAPHITI_PORT: "already-set" };
  loadDotenv("hermes", env, home, cwd);
  expect(env.NEURAL_MEMORY_HOST).toBe("from-hermes");
  expect(env.GRAPHITI_PORT).toBe("already-set");
});

test("detect: HERMES_SESSION_ID presence -> hermes, hook mode", () => {
  const r = detectHarness({ HERMES_SESSION_ID: "sess_abc123" });
  expect(r.id).toBe("hermes");
  expect(r.mode).toBe("hook");
  expect(r.via).toBe("env");
});

test("detect: AGENT=hermes standard wins over tool vars", () => {
  expect(detectHarness({ AGENT: "hermes", CLAUDECODE: "1" }).id).toBe("hermes");
  expect(modeFor("hermes")).toBe("hook");
});

test("hermes guard: block is {decision:'block',reason} — never a Claude permissionDecision", () => {
  const out = guard({ hook_event_name: "pre_tool_call", tool_name: "terminal", tool_input: { command: "git push --force" } });
  const parsed = JSON.parse(out ?? "{}");
  expect(parsed.decision).toBe("block");
  expect(parsed.reason).toContain("BLOCKED");
  expect(out).not.toContain("permissionDecision");
});

test("hermes guard: safe command and small write_file pass (null = allow)", () => {
  expect(guard({ tool_name: "terminal", tool_input: { command: "ls -la" } })).toBeNull();
  expect(guard({ tool_name: "write_file", tool_input: { path: "a.ts", content: "x" } })).toBeNull();
});

test("hermes guard: oversized write_file blocks via the hermes `path` field", () => {
  const out = guard({ tool_name: "write_file", tool_input: { path: "a.ts", content: oversized } });
  expect(JSON.parse(out ?? "{}").decision).toBe("block");
});

test("hermes response: ask/inform degrade to non-blocking {context} (no interactive ask)", () => {
  const ask = JSON.parse(toHermesResponse({ kind: "ask", title: "t", reason: "r" }));
  expect(ask.decision).toBeUndefined();
  expect(ask.context).toContain("CONFIRM");
  const inform = JSON.parse(toHermesResponse({ kind: "inform", title: "t", reason: "r" }));
  expect(inform.context).toContain("NOTE");
});
