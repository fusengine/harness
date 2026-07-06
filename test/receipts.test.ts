import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { classifyReceipt, captureReceipt, recordReceipt } from "../src/tracking/receipts";
import { loadTrack, saveTrack } from "../src/tracking/store";
import { emptyTrack } from "../src/tracking/session-state";
import { trackFile } from "../src/runtime/paths";
import { saveSessionState } from "../src/runtime/home-state";
import { validateTaskSolid } from "../src/runtime/lifecycle/task-completed";
import { trackAgentMemory } from "../src/runtime/lifecycle/agent-memory";

const tmp = (p: string): string => mkdtempSync(join(tmpdir(), p));
const T = 1_000_000_000_000;
const YEAR_MS = 365 * 24 * 3600 * 1000; // older than any FUSE_ENFORCE_TTL_SEC×5 window

/** A session with one modified small (SOLID-clean) code file; returns its paths. */
function session(sid: string): { home: string; stateDir: string; file: string } {
  const home = tmp("fh-rcpt-home-");
  const stateDir = tmp("fh-rcpt-state-");
  const code = join(tmp("fh-rcpt-src-"), "a.ts");
  writeFileSync(code, "export const a = 1;\n");
  saveSessionState(sid, { changes: { modifiedFiles: [code] } }, home);
  return { home, stateDir, file: trackFile(sid, stateDir) };
}

test("classifyReceipt: parses bun test pass/fail counts", () => {
  expect(classifyReceipt("bun test", " 8 pass\n 0 fail\n", 0, T)).toEqual({ kind: "test", exitCode: 0, pass: 8, fail: 0, ts: T });
});

test("classifyReceipt: tsc carries exit code (no counts); non-verification is null", () => {
  expect(classifyReceipt("bunx tsc --noEmit", "", 0, T)).toEqual({ kind: "tsc", exitCode: 0, ts: T });
  expect(classifyReceipt("ls -la", "whatever", 0, T)).toBeNull();
});

test("captureReceipt: persists a parsed receipt into the signed track", async () => {
  const file = join(tmp("fh-rcpt-cap-"), "track.json");
  await captureReceipt(file, "bun test", " 12 pass\n 3 fail\n", 1, T);
  expect((await loadTrack(file)).receipts?.[0]).toEqual({ kind: "test", exitCode: 1, pass: 12, fail: 3, ts: T });
});

test("validateTaskSolid: a fresh passing receipt lets completion pass", async () => {
  const { home, stateDir, file } = session("s-ok");
  await saveTrack(file, recordReceipt(emptyTrack(), { kind: "test", exitCode: 0, pass: 5, fail: 0, ts: T - 1000 }));
  expect(validateTaskSolid({ session_id: "s-ok" }, home, T, stateDir)).toBe("");
});

test("validateTaskSolid: no receipt + code changes → refusal (continue:false + message)", () => {
  const { home, stateDir } = session("s-none");
  const parsed = JSON.parse(validateTaskSolid({ session_id: "s-none" }, home, T, stateDir)) as { continue: boolean; stopReason: string };
  expect(parsed.continue).toBe(false);
  expect(parsed.stopReason).toContain("VERIFICATION RECEIPT REQUIRED");
});

test("validateTaskSolid: a stale receipt → refusal", async () => {
  const { home, stateDir, file } = session("s-stale");
  await saveTrack(file, recordReceipt(emptyTrack(), { kind: "test", exitCode: 0, fail: 0, ts: T - YEAR_MS }));
  expect((JSON.parse(validateTaskSolid({ session_id: "s-stale" }, home, T, stateDir)) as { continue: boolean }).continue).toBe(false);
});

test("validateTaskSolid: a failing receipt (fail>0) → refusal", async () => {
  const { home, stateDir, file } = session("s-fail");
  await saveTrack(file, recordReceipt(emptyTrack(), { kind: "test", exitCode: 0, fail: 2, ts: T - 1000 }));
  expect((JSON.parse(validateTaskSolid({ session_id: "s-fail" }, home, T, stateDir)) as { continue: boolean }).continue).toBe(false);
});

test("validateTaskSolid: a session with no code changes passes without any receipt", () => {
  const home = tmp("fh-rcpt-nochg-");
  saveSessionState("s-empty", { changes: { modifiedFiles: [] } }, home);
  expect(validateTaskSolid({ session_id: "s-empty" }, home, T, tmp("fh-rcpt-st2-"))).toBe("");
});

test("trackAgentMemory: owned code with no fresh receipt appends the receipt reminder", () => {
  const home = tmp("fh-rcpt-agent-");
  const code = join(tmp("fh-x-"), "b.ts");
  writeFileSync(code, "export const b = 1;\n"); // owned file must exist on disk to be reported
  saveSessionState("s-ag", { changes: { cumulativeCodeFiles: 1, modifiedFiles: [code] } }, home);
  const parsed = JSON.parse(trackAgentMemory({ agent_type: "laravel-expert", session_id: "s-ag" }, home, T)) as { hookSpecificOutput?: { additionalContext?: string } };
  expect(parsed.hookSpecificOutput?.additionalContext).toContain("NO VERIFICATION RECEIPT");
});
