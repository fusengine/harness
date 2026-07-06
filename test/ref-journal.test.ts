/**
 * Regression: the "teammate solidRead" gap. A background teammate reads the exact
 * listed SOLID ref, then edits within seconds — faster than the platform flushes
 * its transcript to disk (measured multi-minute lag, past the 120s TTL). So the
 * transcript reconcile CANNOT see the read (unlike the lead, whose read has
 * flushed), and if the live track write was lost to the hook fan-out, solidReadGate
 * blocks despite a genuine read. The append-only journal — written the instant
 * PostToolUse fires, O_APPEND-atomic so the fan-out cannot clobber it, and with no
 * flush lag — restores the read. Proves: transcript-only path BLOCKS, journal path
 * PASSES.
 */
import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { appendFileSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { appendRefRead, reconcileRefReadsFromJournal } from "../src/freshness/ref-journal";
import { reconcileRefReadsFromTranscript } from "../src/freshness/ref-evidence";
import { solidReadGate, type ApexContext } from "../src/policy/apex";
import { emptyTrack } from "../src/tracking/session-state";
import type { RefMeta } from "../src/refs/types";

const REQ = "/plugins/solid-generic/references/architecture-patterns.md";
const NOW = Date.now();
const ref: RefMeta = { name: "arch", description: "", keywords: "", priority: "", related: "", appliesTo: "**/*.ts", triggerOnEdit: "", level: "principle", filePath: REQ };
const base: ApexContext = { sessionId: "s", framework: "generic", filePath: "src/a.ts", content: "", refs: [ref], now: NOW, windowMs: 120_000 };

/** A fresh, empty per-session state dir. */
function stateDir(): string {
  return mkdtempSync(join(tmpdir(), "journal-"));
}

test("teammate read lost to the fan-out AND not yet flushed to the transcript is restored from the journal → solidReadGate passes", () => {
  const dir = stateDir();
  // (1) the fan-out dropped the live write; the teammate's read has NOT flushed to
  //     the transcript yet (absent path simulates the multi-minute lag): BOTH the
  //     bare track and the transcript reconcile leave the gate BLOCKING.
  expect(solidReadGate({ ...base, refsRead: [], refsReadAt: {} })?.kind).toBe("block");
  const txOnly = reconcileRefReadsFromTranscript(emptyTrack(), undefined, NOW);
  expect(solidReadGate({ ...base, refsRead: txOnly.refsRead, refsReadAt: txOnly.refsReadAt })?.kind).toBe("block");
  // (2) PostToolUse journalled the read; folding the journal restores it: gate PASSES.
  appendRefRead(dir, REQ, NOW - 5_000);
  const track = reconcileRefReadsFromJournal(emptyTrack(), dir, NOW);
  expect(track.refsRead).toContain(REQ);
  expect(solidReadGate({ ...base, refsRead: track.refsRead, refsReadAt: track.refsReadAt })).toBeNull();
});

test("journal reconcile is fail-open, ignores non-.md, tolerates malformed lines, and never rolls back a fresher stamp", () => {
  const dir = stateDir();
  // fail-open: no journal file yet → unchanged (same reference).
  expect(reconcileRefReadsFromJournal(emptyTrack(), dir, NOW)).toEqual(emptyTrack());
  // non-.md paths are never journalled (parity with the reconcile filter).
  appendRefRead(dir, "/tmp/notes.txt", NOW);
  expect(reconcileRefReadsFromJournal(emptyTrack(), dir, NOW).refsRead).toEqual([]);
  // a malformed line is tolerated; a valid `.md` line after it still folds in.
  appendFileSync(join(dir, "refs-read.log"), "{ not json\n", "utf-8");
  appendRefRead(dir, REQ, NOW - 1_000);
  const t = reconcileRefReadsFromJournal(emptyTrack(), dir, NOW);
  expect(t.refsRead).toEqual([REQ]);
  // an existing MORE-recent stamp is never rolled back by an older journal entry.
  const seeded = { ...emptyTrack(), refsRead: [REQ], refsReadAt: { [REQ]: NOW } };
  expect(reconcileRefReadsFromJournal(seeded, dir, NOW).refsReadAt?.[REQ]).toBe(NOW);
});

test("appendRefRead writes one JSON line per read and is append-only under repeated (fan-out) calls", () => {
  const dir = stateDir();
  appendRefRead(dir, REQ, NOW);
  appendRefRead(dir, REQ, NOW); // sibling fan-out process re-appends — nothing is lost
  const lines = readFileSync(join(dir, "refs-read.log"), "utf-8").trim().split("\n");
  expect(lines.length).toBe(2);
  expect(JSON.parse(lines[0]!)).toEqual({ p: REQ, t: NOW });
});

test("appendRefRead bounds the SHARED cross-session log (trims past the cap; keeps the recent tail)", () => {
  const dir = stateDir();
  const file = join(dir, "refs-read.log");
  for (let i = 0; i < 3_000; i++) appendRefRead(dir, `${REQ}.${i}.md`, NOW - i);
  const text = readFileSync(file, "utf-8");
  // Untrimmed this would exceed 250 KB; the on-append trim keeps it near the 128 KB cap.
  expect(text.length).toBeLessThan(160 * 1024);
  expect(text).toContain(`${REQ}.2999.md`); // the most-recent append survives the trim
});
