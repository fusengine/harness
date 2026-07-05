/**
 * Fan-out burst dedup (v0.1.55): every deployed plugin has its own hook, so ONE
 * tool event spawns ~11 sibling harness processes that each record the same deny
 * / one-shot within milliseconds. With a `sessionId` scoping the key, those N
 * near-simultaneous records collapse into ONE increment; two spaced retries and
 * two distinct sessions still count independently. See src/runtime/burst-window.
 */
import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { recordDeny } from "../src/runtime/deny-loop-store";
import { recordOneShot } from "../src/tracking/one-shot";
import { gate, type GateInput } from "../src/runtime/gate";
import type { Prompt } from "../src/prompt/types";

const dir = (): string => mkdtempSync(join(tmpdir(), "fh-burst-"));
const block: Prompt = { kind: "block", title: "SOLID file-size limit", reason: "too big" };

test("recordDeny: same hash+session within the burst window counts ONCE; a spaced retry counts again", () => {
  const o = { dir: dir(), windowMs: 120000, sessionId: "s1" };
  expect(recordDeny("Bash", { command: "x" }, { ...o, now: 1000 })).toMatchObject({ isRepeat: false, count: 1 });
  // ~11 sibling plugin hooks of the SAME event land <2s apart → still #1, no re-count.
  expect(recordDeny("Bash", { command: "x" }, { ...o, now: 1100 })).toMatchObject({ count: 1, isRepeat: false, deduped: true });
  expect(recordDeny("Bash", { command: "x" }, { ...o, now: 1500 })).toMatchObject({ count: 1, isRepeat: false, deduped: true });
  // A genuine retry, spaced beyond the burst window → #2, a real repeat.
  expect(recordDeny("Bash", { command: "x" }, { ...o, now: 6000 })).toMatchObject({ count: 2, isRepeat: true });
});

test("recordDeny: two sessions, same hash, same instant → two independent counters (never cross-dedup)", () => {
  const base = { dir: dir(), windowMs: 120000, now: 1000 };
  expect(recordDeny("Bash", { command: "x" }, { ...base, sessionId: "sA" })).toMatchObject({ count: 1, isRepeat: false });
  expect(recordDeny("Bash", { command: "x" }, { ...base, sessionId: "sB" })).toMatchObject({ count: 1, isRepeat: false });
  // Each session escalates on its OWN spaced retry, unaffected by the other's count.
  expect(recordDeny("Bash", { command: "x" }, { ...base, now: 6000, sessionId: "sA" })).toMatchObject({ count: 2, isRepeat: true });
});

test("gate: a 2nd identical deny WITHIN the burst window is NOT a false [REPEAT] (session-scoped)", async () => {
  const f = join(dir(), "t.json");
  const g = (now: number): GateInput => ({ sessionId: "s1", framework: "generic", tool: "Write", filePath: "a.ts", content: "x\n".repeat(150), now, trackFile: f, windowMs: 10000 });
  expect((await gate(g(5000)))?.title).toBe("SOLID file-size limit");
  // A sibling hook for the SAME event, <2s later → folded into #1, no [REPEAT].
  expect((await gate(g(5300)))?.title).toBe("SOLID file-size limit");
});

test("recordOneShot: ~11 sibling hooks of ONE deny (same op+session, burst) count as ONE deny", () => {
  const d = dir();
  for (let i = 0; i < 11; i++) recordOneShot(block, { filePath: "a.ts", content: "x" }, { now: 1000 + i * 50, dir: d, sessionId: "s1" });
  const s = JSON.parse(readFileSync(join(d, "one-shot.json"), "utf8")) as { gates: Record<string, { denies: number }> };
  expect(s.gates["SOLID file-size limit"]?.denies).toBe(1);
});
