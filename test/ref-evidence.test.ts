/**
 * Regression: the LEAD's SOLID-ref reads, lost from the racy session track by the
 * multi-plugin hook fan-out (non-atomic load→save clobbers a lone `refsRead`
 * write), are restored from the durable, append-only transcript so solidReadGate
 * credits them — the bug where only the lead's solidReadGate never unblocked
 * despite reading the exact listed refs. Sub-agents already had this via the
 * SubagentStop evidence harvest; the lead had no reconciliation until now.
 */
import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reconcileRefReadsFromTranscript } from "../src/freshness/ref-evidence";
import { solidReadGate, type ApexContext } from "../src/policy/apex";
import { emptyTrack } from "../src/tracking/session-state";
import type { RefMeta } from "../src/refs/types";

const REQ = "/plugins/solid-generic/references/architecture-patterns.md";
const NOW = Date.now();
const ref: RefMeta = { name: "arch", description: "", keywords: "", priority: "", related: "", appliesTo: "**/*.ts", triggerOnEdit: "", level: "principle", filePath: REQ };

/** Write a one-line transcript with a `Read` of `path` stamped at `ts`. */
function transcript(path: string, ts: number): string {
  const file = join(mkdtempSync(join(tmpdir(), "tx-")), "t.jsonl");
  const line = JSON.stringify({ timestamp: new Date(ts).toISOString(), message: { content: [{ type: "tool_use", name: "Read", input: { file_path: path } }] } });
  writeFileSync(file, line + "\n");
  return file;
}

const base: ApexContext = { sessionId: "s", framework: "generic", filePath: "src/a.ts", content: "", refs: [ref], now: NOW, windowMs: 120_000 };

test("lead ref read lost to the fan-out race is restored from the transcript → solidReadGate passes", () => {
  // (1) the race dropped the ref read from the track: the gate BLOCKS.
  expect(solidReadGate({ ...base, refsRead: [], refsReadAt: {} })?.kind).toBe("block");
  // (2) the durable transcript has the fresh Read; reconciliation restores it: the gate PASSES.
  const track = reconcileRefReadsFromTranscript(emptyTrack(), transcript(REQ, NOW - 30_000), NOW);
  expect(solidReadGate({ ...base, refsRead: track.refsRead, refsReadAt: track.refsReadAt })).toBeNull();
});

test("reconcile fails open on a missing transcript and stamps the transcript ts (a stale read stays stale under the TTL)", () => {
  expect(reconcileRefReadsFromTranscript(emptyTrack(), undefined, NOW)).toEqual(emptyTrack());
  const track = reconcileRefReadsFromTranscript(emptyTrack(), transcript(REQ, NOW - 10 * 60_000), NOW);
  expect(track.refsRead).toContain(REQ);
  expect(solidReadGate({ ...base, refsRead: track.refsRead, refsReadAt: track.refsReadAt })?.kind).toBe("block");
});
