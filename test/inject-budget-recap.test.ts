import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { attachBudgetRecap } from "../src/runtime/inject-budget-recap";
import { resetFragmentRegistry } from "../src/runtime/fragment-registry";
import { capFragment } from "../src/runtime/inject-budget";

const dir = (): string => mkdtempSync(join(tmpdir(), "fh-budget-recap-"));

test("attachBudgetRecap: no-op for events other than SessionStart/SubagentStart", () => {
  const d = dir();
  resetFragmentRegistry();
  capFragment("a", "x");
  capFragment("b", "y");
  const stdout = '{"hookSpecificOutput":{"hookEventName":"PostToolUse"}}';
  expect(attachBudgetRecap(stdout, "PostToolUse", "s1", d, 1000)).toBe(stdout);
});

test("attachBudgetRecap: no-op when only one fragment was recorded (no noise for the common case)", () => {
  const d = dir();
  resetFragmentRegistry();
  capFragment("only-one", "x");
  const stdout = '{"hookSpecificOutput":{"hookEventName":"SessionStart"}}';
  expect(attachBudgetRecap(stdout, "SessionStart", "s1", d, 1000)).toBe(stdout);
});

test("attachBudgetRecap: attaches a systemMessage recap when 2+ fragments were recorded", () => {
  const d = dir();
  resetFragmentRegistry();
  capFragment("a", "x".repeat(10));
  capFragment("b", "y".repeat(20));
  const stdout = '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"ctx"}}';
  const out = attachBudgetRecap(stdout, "SessionStart", "s1", d, 1000);
  const parsed = JSON.parse(out) as { systemMessage?: string; hookSpecificOutput?: { additionalContext?: string } };
  expect(parsed.systemMessage).toBe("injected 2 fragments, 0.0k chars");
  // The original additionalContext is preserved untouched.
  expect(parsed.hookSpecificOutput?.additionalContext).toBe("ctx");
});

test("attachBudgetRecap: burst-deduped — a second call for the SAME (session, event) within the window is suppressed", () => {
  const d = dir();
  resetFragmentRegistry();
  capFragment("a", "x");
  capFragment("b", "y");
  const stdout = '{"hookSpecificOutput":{"hookEventName":"SubagentStart"}}';
  const first = attachBudgetRecap(stdout, "SubagentStart", "s1", d, 1000);
  expect(JSON.parse(first).systemMessage).toBeDefined();
  // Same session+event, still within the burst window → no recap attached again.
  const second = attachBudgetRecap(stdout, "SubagentStart", "s1", d, 1500);
  expect(second).toBe(stdout);
});

test("attachBudgetRecap: a DIFFERENT session is never suppressed by another session's recap", () => {
  const d = dir();
  resetFragmentRegistry();
  capFragment("a", "x");
  capFragment("b", "y");
  const stdout = '{"hookSpecificOutput":{"hookEventName":"SessionStart"}}';
  attachBudgetRecap(stdout, "SessionStart", "s1", d, 1000);
  const other = attachBudgetRecap(stdout, "SessionStart", "s2", d, 1000);
  expect(JSON.parse(other).systemMessage).toBeDefined();
});
