import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildApexTaskContext, buildApexTaskInjection } from "../src/policy/apex-task-context";

/**
 * Target-aware (Claude vs Codex) coverage for the APEX task-context builders —
 * split out of inject-context.test.ts so that file stays under the 100-line
 * SOLID ceiling (mirrors the apex-instruction-preamble.test.ts split).
 */
const root = (): string => mkdtempSync(join(tmpdir(), "fh-ict-"));

test("buildApexTaskContext: explicit id='claude-code' is byte-identical to the default (zero-regression)", () => {
  const state = { id: "2", subject: "x", phase: "plan", docs: "none" };
  expect(buildApexTaskContext(state, 100, "claude-code")).toBe(buildApexTaskContext(state, 100));
});

test("buildApexTaskContext: codex target uses .codex + update_plan, never .claude/TaskUpdate/TaskList", () => {
  const out = buildApexTaskContext({ id: "2", subject: "x", phase: "plan", docs: "none" }, 100, "codex");
  expect(out.startsWith("⚠️ APEX MODE - Read .codex/apex/AGENTS.md for rules")).toBe(true);
  expect(out).toContain("3. update_plan → review the current plan");
  expect(out).toContain("4. update_plan → mark the active step in_progress before starting");
  expect(out.endsWith("7. update_plan → mark the step completed when done")).toBe(true);
  expect(out).not.toContain(".claude");
  expect(out).not.toContain("TaskUpdate");
  expect(out).not.toContain("TaskList");
  expect(out).not.toContain("auto-commit");
});

test("buildApexTaskInjection: codex target resolves .codex/apex, not .claude/apex", () => {
  const a = root();
  mkdirSync(join(a, ".codex", "apex"), { recursive: true });
  expect(buildApexTaskInjection(a, "codex")).toContain("update_plan");
  expect(buildApexTaskInjection(a, "codex")).not.toContain(".claude");
  // A .claude/apex-only project stays inert for the codex target (no cross-target bleed).
  const b = root();
  mkdirSync(join(b, ".claude", "apex"), { recursive: true });
  expect(buildApexTaskInjection(b, "codex")).toBeNull();
});
