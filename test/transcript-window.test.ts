/**
 * Differential gate: the memory-bounded incremental transcript index must give
 * the SAME verdict as the pre-optimization whole-file parsers (oracle) for both
 * agentsRanFromTranscript and reconcileRefReadsFromTranscript — zero tolerance.
 */
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, appendFileSync, openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentsRanFromTranscript } from "../src/freshness/agent-evidence";
import { reconcileRefReadsFromTranscript } from "../src/freshness/ref-evidence";
import { clearTranscriptMemo, loadTranscriptIndex } from "../src/freshness/transcript-index";
import { scanLines } from "../src/freshness/transcript-lines";
import { emptyTrack, recordRefRead, type SessionTrack } from "../src/tracking/session-state";
import { oldAgentsRan, oldReconcile } from "./transcript-window-oracle";
import { genTranscript, rng, WINDOWS } from "./transcript-window-gen";

const ROOT = mkdtempSync(join(tmpdir(), "twin-"));
const NOW = 1_800_000_000_000;
const NAMES: string[][] = [["explore-codebase", "research-expert"], ["explore-codebase"], ["brainstorming"], ["other", "research-expert"]];
const MDS = ["/p/a.md", "/p/b.md", "/skills/x/SKILL.md", "rel.md", "/p/zz.md"];

/** Random but self-consistent starting track (prior stamps via recordRefRead). */
function track(r: () => number): SessionTrack {
  let t = emptyTrack();
  for (const p of MDS) if (r() < 0.4) t = recordRefRead(t, p, NOW - Math.floor(r() * 2_000_000));
  return t;
}

/** Every (names × window) agent verdict + reconcile result vs the oracle; returns mismatches. */
function diff(file: string, r: () => number, dir?: string): string[] {
  clearTranscriptMemo();
  const bad: string[] = [];
  for (const w of WINDOWS) for (const n of NAMES) {
    const a = agentsRanFromTranscript(file, n, w, NOW, dir);
    const b = oldAgentsRan(file, n, w, NOW);
    if (a !== b) bad.push(`agents ${n} w=${w} new=${a} old=${b}`);
  }
  const t = track(r);
  const now = NOW + Math.floor(r() * 5000);
  if (JSON.stringify(reconcileRefReadsFromTranscript(t, file, now, dir)) !== JSON.stringify(oldReconcile(t, file, now))) bad.push("reconcile");
  return bad;
}

test("differential: 6000 random transcripts (stateless + sidecar cold/warm) == oracle", () => {
  const bad: string[] = [];
  for (let i = 0; i < 6000; i++) {
    const r = rng(i + 1);
    const file = join(ROOT, `t${i}.jsonl`);
    writeFileSync(file, genTranscript(r, NOW));
    const dir = mkdtempSync(join(ROOT, "d-"));
    bad.push(...diff(file, r).map((m) => `#${i} stateless ${m}`));
    bad.push(...diff(file, r, dir).map((m) => `#${i} cold ${m}`));
    if (i % 4 === 0) bad.push(...diff(file, r, dir).map((m) => `#${i} warm ${m}`));
  }
  expect(bad.slice(0, 5)).toEqual([]);
}, 300_000);

test("differential: 3000 append-while-reading snapshots (cut mid-line / mid-multibyte) == oracle", () => {
  const bad: string[] = [];
  for (let i = 0; i < 3000; i++) {
    const r = rng(90_000 + i);
    const buf = Buffer.from(genTranscript(r, NOW), "utf8");
    const cuts = [Math.floor(r() * buf.length), Math.floor(r() * buf.length)].sort((x, y) => x - y);
    const file = join(ROOT, `a${i}.jsonl`);
    const dir = mkdtempSync(join(ROOT, "da-"));
    writeFileSync(file, buf.subarray(0, cuts[0]));
    bad.push(...diff(file, r, dir).map((m) => `#${i} s1 ${m}`));
    appendFileSync(file, buf.subarray(cuts[0], cuts[1]));
    bad.push(...diff(file, r, dir).map((m) => `#${i} s2 ${m}`));
    appendFileSync(file, buf.subarray(cuts[1]));
    bad.push(...diff(file, r, dir).map((m) => `#${i} s3 ${m}`));
  }
  expect(bad.slice(0, 5)).toEqual([]);
}, 300_000);

test("differential: replaced/shrunk transcript invalidates the sidecar (== oracle)", () => {
  const bad: string[] = [];
  for (let i = 0; i < 500; i++) {
    const r = rng(500_000 + i);
    const file = join(ROOT, `r${i}.jsonl`);
    const dir = mkdtempSync(join(ROOT, "dr-"));
    writeFileSync(file, genTranscript(r, NOW));
    diff(file, r, dir);
    writeFileSync(file, genTranscript(r, NOW) + genTranscript(r, NOW));
    bad.push(...diff(file, r, dir).map((m) => `#${i} replaced ${m}`));
    writeFileSync(file, genTranscript(r, NOW).slice(0, 50));
    bad.push(...diff(file, r, dir).map((m) => `#${i} shrunk ${m}`));
  }
  expect(bad.slice(0, 5)).toEqual([]);
}, 300_000);

test("tiny chunk sizes (multibyte straddling every boundary) give the identical index", () => {
  for (let i = 0; i < 600; i++) {
    const r = rng(700_000 + i);
    const file = join(ROOT, `c${i}.jsonl`);
    writeFileSync(file, genTranscript(r, NOW));
    clearTranscriptMemo();
    const whole = loadTranscriptIndex(file);
    clearTranscriptMemo();
    const tiny = loadTranscriptIndex(file, undefined, 1 + Math.floor(r() * 97));
    expect([...(tiny?.agents ?? [])]).toEqual([...(whole?.agents ?? [])]);
    expect([...(tiny?.refs ?? [])]).toEqual([...(whole?.refs ?? [])]);
  }
});

test("scanLines == split('\\n') on bytes for any chunk size", () => {
  for (let i = 0; i < 300; i++) {
    const r = rng(900_000 + i);
    const text = genTranscript(r, NOW);
    const file = join(ROOT, `s${i}.jsonl`);
    writeFileSync(file, text);
    const fd = openSync(file, "r");
    const got: string[] = [];
    const size = Buffer.byteLength(text);
    const { rest } = scanLines(fd, 0, size, (l) => got.push(l.toString("utf8")), 1 + Math.floor(r() * 50));
    closeSync(fd);
    if (rest) got.push(rest.toString("utf8"));
    const want = text.split("\n");
    if (want[want.length - 1] === "") want.pop();
    expect(got).toEqual(want);
  }
});

test("unreadable / undefined transcript fails open exactly like the oracle", () => {
  const t = emptyTrack();
  expect(agentsRanFromTranscript(undefined, ["x"], 1, NOW)).toBe(false);
  expect(agentsRanFromTranscript(join(ROOT, "nope"), ["x"], 1, NOW)).toBe(false);
  expect(reconcileRefReadsFromTranscript(t, join(ROOT, "nope"), NOW, ROOT)).toBe(t);
  expect(reconcileRefReadsFromTranscript(t, undefined, NOW)).toBe(t);
});
