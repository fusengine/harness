import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { saveSessionState } from "../src/runtime/home-state";
import { validateTaskSolid } from "../src/runtime/lifecycle/task-completed";
import { resolveMaxLines } from "../src/config/limits";
import { throttleMs } from "../src/memory/state";
import { oncePerWindow } from "../src/runtime/inject-dedup";

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

/** Session `sid` with one small (SOLID-clean) code file and no receipt. */
function unverified(sid: string): { home: string; stateDir: string } {
  const home = root();
  const small = join(root(), "ok.ts");
  writeFileSync(small, "export const x = 1;\n");
  saveSessionState(sid, { changes: { modifiedFiles: [small] } }, home);
  return { home, stateDir: root() };
}

test("Stop: the receipt refusal keeps its shape and repeats on the lessons cadence (throttleMs), never in bursts", () => {
  const { home, stateDir } = unverified("st4");
  const win = throttleMs();
  const parsed = JSON.parse(validateTaskSolid({ session_id: "st4" }, home, T, stateDir, "Stop")) as { continue: boolean; stopReason: string };
  expect(parsed.continue).toBe(false);
  expect(parsed.stopReason).toContain("VERIFICATION RECEIPT REQUIRED");
  for (const dt of [1, 60_000, win - 1]) expect(validateTaskSolid({ session_id: "st4" }, home, T + dt, stateDir, "Stop")).toBe("");
  expect(validateTaskSolid({ session_id: "st4" }, home, T + win, stateDir, "Stop")).toContain("VERIFICATION RECEIPT REQUIRED");
  expect(validateTaskSolid({ session_id: "st4" }, home, T + win + 1, stateDir, "Stop")).toBe("");
});

test("Stop: a short-window dedup caller in the same state dir does not reset the Stop cooldowns", () => {
  const { home, stateDir } = unverified("st5");
  expect(validateTaskSolid({ session_id: "st5" }, home, T, stateDir, "Stop")).not.toBe("");
  const big = oversized("st6");
  expect(validateTaskSolid({ session_id: "st6" }, big.home, T, stateDir, "Stop")).not.toBe("");
  // a 3 s caller (per-prompt context inject) prunes ITS sidecar with its own window
  expect(oncePerWindow("probe", 3000, { now: T + 120_000, dir: stateDir })).toBe(true);
  expect(validateTaskSolid({ session_id: "st5" }, home, T + 120_001, stateDir, "Stop")).toBe("");
  expect(validateTaskSolid({ session_id: "st6" }, big.home, T + 120_001, stateDir, "Stop")).toBe("");
});

test("non-regression: TaskCompleted still reports on every call with the same bytes (no dedup there)", () => {
  const { home, stateDir } = oversized("tc1");
  const a = validateTaskSolid({ session_id: "tc1", task_id: "t-1", task_subject: "Port" }, home, T, stateDir);
  const b = validateTaskSolid({ session_id: "tc1", task_id: "t-1", task_subject: "Port" }, home, T + 1, stateDir);
  expect(a).toBe(b);
  expect((JSON.parse(a) as { systemMessage: string }).systemMessage).toContain("SOLID VIOLATION in task 'Port' (t-1)");
});
