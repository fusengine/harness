import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { saveSessionState } from "../src/runtime/home-state";
import { validateTaskSolid } from "../src/runtime/lifecycle/task-completed";
import { trackFile } from "../src/runtime/paths";
import { saveTrack } from "../src/tracking/store";
import { recordReceipt } from "../src/tracking/receipts";
import { emptyTrack } from "../src/tracking/session-state";
import { resolveMaxLines } from "../src/config/limits";

const root = (): string => mkdtempSync(join(tmpdir(), "fh-task-"));
const T = 1_000_000_000_000;
// Fixture size tracks the same resolver the gate uses (`FUSE_SOLID_MAX_LINES` ?? default),
// so the file stays oversized regardless of the ambient env override.
const L = resolveMaxLines();

test("validateTaskSolid: flags a modified code file over the line ceiling (advisory systemMessage — TaskCompleted rejects hookSpecificOutput)", () => {
  const home = root();
  const big = join(root(), "huge.ts");
  const n = L + 50;
  writeFileSync(big, "// line\n".repeat(n));
  saveSessionState("s1", { changes: { modifiedFiles: [big] } }, home);
  const out = validateTaskSolid({ session_id: "s1", task_id: "t-1", task_subject: "Port" }, home);
  const parsed = JSON.parse(out) as { systemMessage?: string; hookSpecificOutput?: unknown };
  expect(parsed.hookSpecificOutput).toBeUndefined();
  expect(parsed.systemMessage).toContain("SOLID VIOLATION");
  expect(parsed.systemMessage).toContain(`exceed ${L} lines`);
  expect(parsed.systemMessage).toContain(`huge.ts: ${n} lines (max ${L})`);
});

test("validateTaskSolid: compliant files but NO receipt → refusal (continue:false + message)", () => {
  const home = root();
  const stateDir = root();
  const small = join(root(), "ok.ts");
  writeFileSync(small, "export const x = 1;\n");
  saveSessionState("s2", { changes: { modifiedFiles: [small] } }, home);
  const parsed = JSON.parse(validateTaskSolid({ session_id: "s2", task_id: "t", task_subject: "s" }, home, T, stateDir)) as { continue: boolean; stopReason: string };
  expect(parsed.continue).toBe(false);
  expect(parsed.stopReason).toContain("VERIFICATION RECEIPT REQUIRED");
});

test("validateTaskSolid: compliant files WITH a fresh passing receipt → empty (completion passes)", async () => {
  const home = root();
  const stateDir = root();
  const small = join(root(), "ok.ts");
  writeFileSync(small, "export const x = 1;\n");
  saveSessionState("s2b", { changes: { modifiedFiles: [small] } }, home);
  await saveTrack(trackFile("s2b", stateDir), recordReceipt(emptyTrack(), { kind: "test", exitCode: 0, pass: 3, fail: 0, ts: T - 1000 }));
  expect(validateTaskSolid({ session_id: "s2b", task_id: "t", task_subject: "s" }, home, T, stateDir)).toBe("");
});

test("validateTaskSolid: a session with no tracked files returns empty", () => {
  const home = root();
  expect(validateTaskSolid({ session_id: "s3" }, home)).toBe("");
});
