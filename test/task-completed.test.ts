import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { saveSessionState } from "../src/runtime/home-state";
import { validateTaskSolid } from "../src/runtime/lifecycle/task-completed";

const root = (): string => mkdtempSync(join(tmpdir(), "fh-task-"));

test("validateTaskSolid: flags a modified code file over the line ceiling", () => {
  const home = root();
  const big = join(root(), "huge.ts");
  writeFileSync(big, "// line\n".repeat(150));
  saveSessionState("s1", { changes: { modifiedFiles: [big] } }, home);
  const out = validateTaskSolid({ session_id: "s1", task_id: "t-1", task_subject: "Port" }, home);
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  expect(ctx).toContain("SOLID VIOLATION");
  expect(ctx).toContain("exceed 100 lines");
  expect(ctx).toContain("huge.ts: 150 lines (max 100)");
});

test("validateTaskSolid: returns empty when files comply or none tracked", () => {
  const home = root();
  const small = join(root(), "ok.ts");
  writeFileSync(small, "export const x = 1;\n");
  saveSessionState("s2", { changes: { modifiedFiles: [small] } }, home);
  expect(validateTaskSolid({ session_id: "s2", task_id: "t", task_subject: "s" }, home)).toBe("");
  expect(validateTaskSolid({ session_id: "s3" }, home)).toBe("");
});
