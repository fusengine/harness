import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { saveSessionState } from "../src/runtime/home-state";
import { validateTaskSolid } from "../src/runtime/lifecycle/task-completed";
import { resolveMaxLines } from "../src/config/limits";

const root = (): string => mkdtempSync(join(tmpdir(), "fh-stop-once-"));
const L = resolveMaxLines();
const T = 1_000_000_000_000;

/** Session `sid` whose modified list holds one oversized code file (reproduces the reported Stop loop). */
function oversized(sid: string, lines = L + 50): { home: string; stateDir: string; file: string } {
  const home = root();
  const file = join(root(), "engine.ts");
  writeFileSync(file, "// line\n".repeat(lines));
  saveSessionState(sid, { changes: { modifiedFiles: [file] } }, home);
  return { home, stateDir: root(), file };
}

test("Stop: the SOLID verdict is emitted once, then silent on identical repeats (no per-turn loop)", () => {
  const { home, stateDir } = oversized("st1");
  const first = validateTaskSolid({ session_id: "st1" }, home, T, stateDir, "Stop");
  const o = JSON.parse(first) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
  expect(o.hookSpecificOutput.hookEventName).toBe("Stop");
  expect(o.hookSpecificOutput.additionalContext).toContain(`engine.ts: ${L + 50} lines (max ${L})`);
  expect(o.hookSpecificOutput.additionalContext).toContain("Action: split each into modules");
  expect(o.hookSpecificOutput.additionalContext).not.toContain("task ''");
  for (let i = 1; i <= 5; i++) expect(validateTaskSolid({ session_id: "st1" }, home, T + i * 60_000, stateDir, "Stop")).toBe("");
});

test("Stop: the notice re-arms when the file size changes", () => {
  const { home, stateDir, file } = oversized("st2");
  expect(validateTaskSolid({ session_id: "st2" }, home, T, stateDir, "Stop")).not.toBe("");
  expect(validateTaskSolid({ session_id: "st2" }, home, T + 1, stateDir, "Stop")).toBe("");
  writeFileSync(file, "// line\n".repeat(L + 10));
  expect(validateTaskSolid({ session_id: "st2" }, home, T + 2, stateDir, "Stop")).toContain(`engine.ts: ${L + 10} lines`);
});

test("Stop on Codex: same text as decision:block + reason (Codex Stop rejects hookSpecificOutput)", () => {
  const { home, stateDir } = oversized("st3");
  const o = JSON.parse(validateTaskSolid({ session_id: "st3" }, home, T, stateDir, "Stop", "codex")) as Record<string, unknown>;
  expect(Object.keys(o).sort()).toEqual(["decision", "reason"]);
  expect(o.decision).toBe("block");
  expect(String(o.reason)).toContain("Action: split each into modules");
});

test("Stop: the receipt refusal keeps its exact shape but is emitted once per unchanged file set", () => {
  const home = root();
  const small = join(root(), "ok.ts");
  writeFileSync(small, "export const x = 1;\n");
  saveSessionState("st4", { changes: { modifiedFiles: [small] } }, home);
  const stateDir = root();
  const parsed = JSON.parse(validateTaskSolid({ session_id: "st4" }, home, T, stateDir, "Stop")) as { continue: boolean; stopReason: string };
  expect(parsed.continue).toBe(false);
  expect(parsed.stopReason).toContain("VERIFICATION RECEIPT REQUIRED");
  expect(validateTaskSolid({ session_id: "st4" }, home, T + 1, stateDir, "Stop")).toBe("");
});

test("non-regression: TaskCompleted still reports on every call with the same bytes (no dedup there)", () => {
  const { home, stateDir } = oversized("tc1");
  const a = validateTaskSolid({ session_id: "tc1", task_id: "t-1", task_subject: "Port" }, home, T, stateDir);
  const b = validateTaskSolid({ session_id: "tc1", task_id: "t-1", task_subject: "Port" }, home, T + 1, stateDir);
  expect(a).toBe(b);
  expect((JSON.parse(a) as { systemMessage: string }).systemMessage).toContain("SOLID VIOLATION in task 'Port' (t-1)");
});
