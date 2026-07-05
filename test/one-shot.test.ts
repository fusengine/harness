import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, existsSync } from "node:fs";
import { join } from "node:path";
import { applyAllow, applyDeny, EMPTY, formatSummary, pruneState } from "../src/tracking/one-shot-store";
import { oneShotSummary, recordOneShot } from "../src/tracking/one-shot";
import { trackFile, defaultStateDir } from "../src/runtime/paths";
import { gate, type GateInput } from "../src/runtime/gate";
import type { Prompt } from "../src/prompt/types";

const dir = (): string => mkdtempSync(join(tmpdir(), "fh-oneshot-"));
const block: Prompt = { kind: "block", title: "SOLID file-size limit", reason: "too big" };
const WEEK = 7 * 24 * 60 * 60 * 1000;

test("applyDeny: bumps the gate deny count and opens a pending entry for the op", () => {
  const s = applyDeny({ ...EMPTY }, "SOLID file-size limit", "op1", 100);
  expect(s.gates["SOLID file-size limit"]).toMatchObject({ denies: 1, corrected: 0, lastTs: 100 });
  expect(s.pending.op1).toMatchObject({ title: "SOLID file-size limit", ts: 100 });
});

test("applyAllow: pending deny -> corrected (credited to gate, clears pending)", () => {
  const s = applyAllow(applyDeny({ ...EMPTY }, "DRY", "op1", 100), "op1", 200, true);
  expect(s.corrected).toBe(1);
  expect(s.firstTry).toBe(0);
  expect(s.gates.DRY).toMatchObject({ denies: 1, corrected: 1 });
  expect(s.pending.op1).toBeUndefined();
});

test("applyAllow: no pending + gateable = one-shot; non-gateable = no change (incl. pending)", () => {
  expect(applyAllow({ ...EMPTY }, "op1", 200, true).firstTry).toBe(1);
  expect(applyAllow({ ...EMPTY }, "op1", 200, false)).toEqual({ ...EMPTY });
  const withPending = applyDeny({ ...EMPTY }, "DRY", "op1", 100);
  expect(applyAllow(withPending, "op1", 200, false)).toBe(withPending); // a Read never clears a deny
});

test("pruneState: idle past window resets everything; else per-entry prune", () => {
  const stale = applyDeny({ ...EMPTY }, "G", "op1", 1000);
  expect(pruneState(stale, 1000 + WEEK, WEEK)).toEqual({ ...EMPTY });
  const s = { ...EMPTY, gates: { old: { denies: 1, corrected: 0, lastTs: 10 }, fresh: { denies: 1, corrected: 0, lastTs: 900 } }, pending: { p: { title: "old", ts: 10 } }, updatedAt: 900 };
  const pruned = pruneState(s, 1000, 500);
  expect(pruned.gates.old).toBeUndefined();
  expect(pruned.gates.fresh).toBeDefined();
  expect(pruned.pending.p).toBeUndefined();
});

test("formatSummary: '' when empty; else rate + per-gate denies/fixes sorted by denies", () => {
  expect(formatSummary({ ...EMPTY })).toBe("");
  let s = applyAllow({ ...EMPTY }, "a", 1, true);
  s = applyDeny(s, "DRY", "b", 2);
  s = applyDeny(s, "SOLID file-size limit", "c", 3);
  s = applyDeny(s, "SOLID file-size limit", "c", 4);
  s = applyAllow(s, "c", 5, true);
  const out = formatSummary(s);
  expect(out).toContain("one-shot (1/2 clean)"); // firstTry=1, corrected=1
  expect(out.indexOf("SOLID file-size limit")).toBeLessThan(out.indexOf("DRY"));
  expect(out).toContain("SOLID file-size limit 2den/1fix");
});

test("recordOneShot: block persists a deny; ask/inform write nothing", () => {
  const d = dir();
  recordOneShot(block, { filePath: "a.ts", content: "x" }, { now: 1000, dir: d });
  expect(existsSync(join(d, "one-shot.json"))).toBe(true);
  const d2 = dir();
  recordOneShot({ kind: "ask", title: "Confirm", reason: "r" }, { filePath: "a.ts", content: "x" }, { now: 1000, dir: d2 });
  expect(existsSync(join(d2, "one-shot.json"))).toBe(false);
});

test("recordOneShot -> oneShotSummary(cwd) cycle: writer dir == reader dir (was broken)", () => {
  const cwd = dir();
  const d = defaultStateDir(cwd);
  const now = Date.now();
  recordOneShot(block, { filePath: "a.ts", content: "big" }, { now, dir: d });
  recordOneShot(null, { filePath: "a.ts", content: "small" }, { now: now + 10, dir: d });
  const out = oneShotSummary(cwd);
  expect(out).toContain("SOLID file-size limit 1den/1fix");
  expect(out).toContain("one-shot (0/1 clean)");
});

test("oneShotSummary: '' for a project with no state written yet", () => {
  expect(oneShotSummary(dir())).toBe("");
});

const oversized = (f: string, now: number): GateInput => ({
  sessionId: "s1", framework: "generic", tool: "Write", filePath: "a.ts",
  content: "x\n".repeat(150), now, trackFile: f, windowMs: 10000,
});

test("gate cycle via oneShotSummary(cwd): deny->fix is found (regression) AND a clean edit is one-shot", async () => {
  const now = Date.now();
  const c1 = dir(); const f1 = trackFile("s1", defaultStateDir(c1)); // exactly how handle.ts wires it
  await gate(oversized(f1, now));
  await gate({ ...oversized(f1, now + 10), tool: "Edit", content: "a\nb\nc" });
  expect(oneShotSummary(c1)).toContain("SOLID file-size limit 1den/1fix");
  const c2 = dir(); const f2 = trackFile("s1", defaultStateDir(c2));
  expect(await gate({ sessionId: "s1", framework: "generic", tool: "Edit", filePath: "a.ts", content: "a\nb\nc", windowMs: 10000, trackFile: f2, now })).toBeNull();
  expect(oneShotSummary(c2)).toContain("one-shot (1/1 clean)");
});
