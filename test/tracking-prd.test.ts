import { test, expect } from "bun:test";
import { join } from "node:path";
import { loadTrack, withTrack } from "../src/tracking/store";
import { appendEvent, foldEvents } from "../src/tracking/track-journal";
import { readEvents } from "../src/tracking/track-compact";
import { diffTrackEvents } from "../src/tracking/track-diff";
import {
  emptyTrack, prdAlreadyBlocked, PRD_VIOLATIONS_CAP,
  recordPrdOwner, recordPrdStopBlocked, recordPrdViolation,
  type PrdViolationRecord, type SessionTrack,
} from "../src/tracking/session-state";
import { dir, withEnv } from "./helpers/track-env";

const BASE = 1_700_000_000_000;
const violation = (n: number): PrdViolationRecord => ({ ts: BASE + n, task: "t", agent: "a", sub: `s${n}`, reason: "no done" });

test("recordPrdOwner: merge, idempotent no-op on the same binding", () => {
  const t1 = recordPrdOwner(emptyTrack(), "call-1", "backend-expert");
  expect(t1.prdOwners).toEqual({ "call-1": "backend-expert" });
  const t2 = recordPrdOwner(t1, "call-1", "backend-expert");
  expect(t2).toBe(t1); // same reference: true no-op
  const t3 = recordPrdOwner(t1, "call-2", "backend-expert-2");
  expect(t3.prdOwners).toEqual({ "call-1": "backend-expert", "call-2": "backend-expert-2" });
});

test("recordPrdViolation: append-only, uncapped in the mutator itself", () => {
  let t = emptyTrack();
  for (let i = 0; i < 3; i++) t = recordPrdViolation(t, violation(i));
  expect(t.prdViolations).toHaveLength(3);
  expect(t.prdViolations?.[0]?.sub).toBe("s0");
});

test("recordPrdStopBlocked + prdAlreadyBlocked: merge, one-shot lookup", () => {
  const t1 = recordPrdStopBlocked(emptyTrack(), "sid:SubagentStop:backend-expert", BASE);
  expect(prdAlreadyBlocked(t1, "sid:SubagentStop:backend-expert")).toBe(true);
  expect(prdAlreadyBlocked(t1, "sid:SubagentStop:other")).toBe(false);
  expect(prdAlreadyBlocked(emptyTrack(), "sid:SubagentStop:backend-expert")).toBe(false);
});

test("foldEvents: prdOwners merges, prdViolations appends (capped), prdStopBlocked merges", () => {
  const log = join(dir(), "track-prd-fold.log");
  appendEvent(log, "prdOwners", "merge", ["call-1", "backend-expert"], BASE);
  appendEvent(log, "prdOwners", "merge", ["call-2", "backend-expert-2"], BASE + 1);
  appendEvent(log, "prdViolations", "append", violation(1), BASE + 2);
  appendEvent(log, "prdViolations", "append", violation(2), BASE + 3);
  appendEvent(log, "prdStopBlocked", "merge", ["sid:Stop", BASE + 4], BASE + 4);
  const t = foldEvents(readEvents(log));
  expect(t.prdOwners).toEqual({ "call-1": "backend-expert", "call-2": "backend-expert-2" });
  expect(t.prdViolations).toHaveLength(2);
  expect(t.prdStopBlocked).toEqual({ "sid:Stop": BASE + 4 });
});

test("foldEvents: prdViolations is capped at PRD_VIOLATIONS_CAP, oldest evicted first", () => {
  const log = join(dir(), "track-prd-cap.log");
  const n = PRD_VIOLATIONS_CAP + 5;
  for (let i = 0; i < n; i++) appendEvent(log, "prdViolations", "append", violation(i), BASE + i);
  const t = foldEvents(readEvents(log));
  expect(t.prdViolations).toHaveLength(PRD_VIOLATIONS_CAP);
  expect(t.prdViolations?.[0]?.sub).toBe(`s5`); // first 5 evicted
  expect(t.prdViolations?.at(-1)?.sub).toBe(`s${n - 1}`);
});

test("legacy track file predating the PRD fields folds without error (backward compat)", () => {
  const base: SessionTrack = emptyTrack(); // no prdOwners/prdViolations/prdStopBlocked keys at all
  const log = join(dir(), "track-prd-legacy.log");
  appendEvent(log, "refsRead", "add", "a.md", BASE);
  const t = foldEvents(readEvents(log), base);
  expect(t.prdOwners).toBeUndefined();
  expect(t.prdViolations).toBeUndefined();
  expect(t.prdStopBlocked).toBeUndefined();
  expect(t.refsRead).toEqual(["a.md"]);
});

test("diffTrackEvents: prdOwners/prdStopBlocked emit only changed keys (merge), prdViolations emits only the tail (append)", () => {
  const prev = recordPrdOwner(emptyTrack(), "call-1", "backend-expert");
  const next = recordPrdOwner(prev, "call-2", "backend-expert-2");
  const events = diffTrackEvents(prev, next, BASE);
  expect(events).toEqual([{ field: "prdOwners", op: "merge", value: ["call-2", "backend-expert-2"], ts: BASE }]);

  const prevV = recordPrdViolation(emptyTrack(), violation(1));
  const nextV = recordPrdViolation(prevV, violation(2));
  const ve = diffTrackEvents(prevV, nextV, BASE);
  expect(ve).toEqual([{ field: "prdViolations", op: "append", value: violation(2), ts: violation(2).ts }]);

  const prevB = recordPrdStopBlocked(emptyTrack(), "sid:Stop", BASE);
  const nextB = recordPrdStopBlocked(prevB, "sid:Stop:agent", BASE + 1);
  const be = diffTrackEvents(prevB, nextB, BASE + 1);
  expect(be).toEqual([{ field: "prdStopBlocked", op: "merge", value: ["sid:Stop:agent", BASE + 1], ts: BASE + 1 }]);
});

test("diffTrackEvents: crossing PRD_VIOLATIONS_CAP does NOT re-emit already-journaled violations as duplicate events (regression: eviction must not look like a bulk rewrite)", () => {
  // Simulate the exact runtime shape: `prev` is what loadTrack() would hand
  // back — already capped at PRD_VIOLATIONS_CAP by foldEvents — and `next` is
  // one more append past the cap.
  let prev = emptyTrack();
  for (let i = 0; i < PRD_VIOLATIONS_CAP; i++) prev = recordPrdViolation(prev, violation(i));
  prev = { ...prev, prdViolations: prev.prdViolations!.slice(-PRD_VIOLATIONS_CAP) };
  const next = recordPrdViolation(prev, violation(PRD_VIOLATIONS_CAP));
  const events = diffTrackEvents(prev, next, BASE + 999);
  expect(events).toHaveLength(1); // NOT 50 — only the genuinely new violation
  expect(events[0]).toEqual({ field: "prdViolations", op: "append", value: violation(PRD_VIOLATIONS_CAP), ts: violation(PRD_VIOLATIONS_CAP).ts });
});

test("withTrack round-trip through the real journal store: prdOwners/prdViolations/prdStopBlocked persist and re-load", async () => {
  await withEnv(undefined, async () => {
    const file = join(dir(), "track.json");
    await withTrack(file, (t) => recordPrdOwner(t, "call-1", "backend-expert"));
    await withTrack(file, (t) => recordPrdViolation(t, violation(1)));
    await withTrack(file, (t) => recordPrdStopBlocked(t, "sid:Stop", BASE));
    const loaded = await loadTrack(file);
    expect(loaded.prdOwners).toEqual({ "call-1": "backend-expert" });
    expect(loaded.prdViolations).toHaveLength(1);
    expect(loaded.prdStopBlocked).toEqual({ "sid:Stop": BASE });
  });
});
