import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, existsSync } from "node:fs";
import { join } from "node:path";
import { denyHash, denyLoopCheck, enrichRepeatDeny } from "../src/policy/deny-loop";
import { recordDeny, withDenyLoop } from "../src/runtime/deny-loop-store";
import { gate, type GateInput } from "../src/runtime/gate";
import type { Prompt } from "../src/prompt/types";
import { resolveMaxLines } from "../src/config/limits";

const dir = (): string => mkdtempSync(join(tmpdir(), "fh-deny-"));
const block: Prompt = { kind: "block", title: "SOLID file-size limit", reason: "too big", actions: ["Split"] };

test("denyHash: key order does not change the hash (normalized input)", () => {
  expect(denyHash("Write", { a: 1, b: 2 })).toBe(denyHash("Write", { b: 2, a: 1 }));
  expect(denyHash("Write", { a: 1 })).not.toBe(denyHash("Edit", { a: 1 }));
});

test("denyLoopCheck: first is #1 not a repeat; an in-window prior makes #2 a repeat", () => {
  const h = "hh";
  expect(denyLoopCheck(h, {}, { now: 100, windowMs: 1000 })).toMatchObject({ isRepeat: false, count: 1 });
  const prior = { [h]: { count: 1, lastTs: 100 } };
  expect(denyLoopCheck(h, prior, { now: 500, windowMs: 1000 })).toMatchObject({ isRepeat: true, count: 2 });
  // A prior older than the window is ignored → fresh #1.
  expect(denyLoopCheck(h, prior, { now: 2000, windowMs: 1000 })).toMatchObject({ isRepeat: false, count: 1 });
});

test("enrichRepeatDeny: [REPEAT] title, STOP-prefixed reason, forced research action, no mutation", () => {
  const out = enrichRepeatDeny(block, 3);
  expect(out.title).toBe("[REPEAT] SOLID file-size limit");
  expect(out.reason).toContain("Identical attempt #3");
  expect(out.reason).toContain("too big");
  expect(out.actions?.[0]).toContain("research-expert");
  expect(out.actions).toContain("Split");
  // original untouched (shared consts like FAIL_CLOSED must not be mutated)
  expect(block.title).toBe("SOLID file-size limit");
  expect(enrichRepeatDeny(out, 4).title).toBe("[REPEAT] SOLID file-size limit"); // idempotent title
});

test("recordDeny: 2nd identical is a repeat, a changed input is #1, window expiry resets, sidecar persists", () => {
  const d = dir();
  const o = { now: 1000, dir: d, windowMs: 5000 };
  expect(recordDeny("Write", { filePath: "a.ts" }, o).isRepeat).toBe(false);
  expect(recordDeny("Write", { filePath: "a.ts" }, { ...o, now: 1500 })).toMatchObject({ isRepeat: true, count: 2 });
  expect(recordDeny("Write", { filePath: "b.ts" }, { ...o, now: 1600 }).isRepeat).toBe(false);
  expect(recordDeny("Write", { filePath: "a.ts" }, { ...o, now: 9000 }).isRepeat).toBe(false); // expired
  expect(existsSync(join(d, "deny-loop.json"))).toBe(true);
});

test("withDenyLoop: allow (null) and non-block prompts pass through untouched", () => {
  const o = { now: 1, dir: dir(), windowMs: 5000 };
  expect(withDenyLoop(null, "Write", { filePath: "a.ts" }, o)).toBeNull();
  const ask: Prompt = { kind: "ask", title: "Confirm", reason: "r" };
  expect(withDenyLoop(ask, "Write", { filePath: "a.ts" }, o)).toBe(ask); // never recorded nor enriched
});

test("withDenyLoop: a repeated block is enriched; the first is not", () => {
  const o = { now: 1000, dir: dir(), windowMs: 5000 };
  expect(withDenyLoop(block, "Write", { filePath: "a.ts" }, o)?.title).toBe("SOLID file-size limit");
  expect(withDenyLoop(block, "Write", { filePath: "a.ts" }, { ...o, now: 1500 })?.title).toBe("[REPEAT] SOLID file-size limit");
});

// Integration through gate(): the sidecar lands in dirname(trackFile), so reusing
// the same track file across calls shares the deny map. (Burst dedup coverage
// lives in burst-dedup.test.ts.)
// Tracks the gate's own resolver (`FUSE_SOLID_MAX_LINES` ?? default) so this
// fixture stays oversized regardless of the ambient env override.
const oversized = (trackFile: string): GateInput => ({
  sessionId: "s1", framework: "generic", tool: "Write", filePath: "a.ts",
  content: "x\n".repeat(resolveMaxLines() + 50), now: 5000, trackFile, windowMs: 10000,
});

test("gate: 1st deny is normal; an identical retry becomes [REPEAT] with a research action", async () => {
  const f = join(dir(), "t.json");
  const first = await gate(oversized(f));
  expect(first?.title).toBe("SOLID file-size limit");
  // Spaced BEYOND the burst window (oversized carries sessionId "s1", arming the
  // fan-out dedup): now 5000 → 8000 is a genuine retry, so it escalates.
  const second = await gate({ ...oversized(f), now: 8000 });
  expect(second?.title).toBe("[REPEAT] SOLID file-size limit");
  expect(second?.actions?.[0]).toContain("research-expert");
});

test("gate: a modified input (different content) is a fresh deny, not a repeat", async () => {
  const f = join(dir(), "t.json");
  await gate(oversized(f));
  // Different content, still oversized (tracks the same resolver as `oversized`).
  const changed = await gate({ ...oversized(f), content: "y\n".repeat(resolveMaxLines() + 50), now: 6000 });
  expect(changed?.title).toBe("SOLID file-size limit");
});

test("gate: once the window elapses the identical deny resets to a normal message", async () => {
  const f = join(dir(), "t.json");
  await gate(oversized(f));
  const later = await gate({ ...oversized(f), now: 5000 + 10000 }); // now - lastTs == windowMs → pruned
  expect(later?.title).toBe("SOLID file-size limit");
});

test("gate: an allowed call (small Edit) is never touched by the anti-loop", async () => {
  const f = join(dir(), "t.json");
  const base = { sessionId: "s1", framework: "react", tool: "Edit", filePath: "a.ts", content: "a\nb\nc", windowMs: 10000, trackFile: f };
  expect(await gate({ ...base, now: 5000 })).toBeNull();
  expect(await gate({ ...base, now: 6000 })).toBeNull(); // still allowed, no [REPEAT] fabricated
});
