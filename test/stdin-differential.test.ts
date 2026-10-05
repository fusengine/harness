/**
 * Zero-regression differential: the OLD read-to-EOF readers (verbatim fixtures
 * in stdin-legacy-fixture.ts) vs the NEW idle-aware readers over every input
 * class that ends with EOF today, with randomized chunkings. Identical results.
 */
import { expect, test } from "bun:test";
import { closeSync, mkdtempSync, openSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCursorBounded } from "../src/cli/cursor-stdin-reader";
import { readBounded } from "../src/cli/hook-io";
import type { StdinIo } from "../src/cli/stdin-pull";
import { chunked, fdRd, legacyBounded, legacyCursor, planOf, planRd, rng, type Read } from "./stdin-legacy-fixture";

const dir = mkdtempSync(join(tmpdir(), "fh-stdin-diff-"));
let seq = 0;

/** Run a (fd, max) reader on `bytes` through a real temp file (64 KiB reads). */
function viaFile(bytes: Buffer, read: (fd: number, max: number) => Read, max: number): Read {
  const f = join(dir, `in-${seq++}.bin`);
  writeFileSync(f, bytes);
  const fd = openSync(f, "r");
  try { return read(fd, max); } finally { closeSync(fd); }
}
const oldBounded = (fd: number, max: number): Read => legacyBounded(fdRd(fd), max);
const oldCursor = (fd: number, max: number): Read => legacyCursor(fdRd(fd), max);

const obj = (event: string, pad = 0): string => JSON.stringify({ hook_event_name: event, session_id: "s", tool_name: "Bash", tool_input: { command: "x".repeat(pad) } });
/** JSON object whose multibyte `ch` starts at byte offset `at` (prefix `{"x":"` is 6 bytes). */
const withCharAt = (ch: string, at: number): string => `{"x":"${"p".repeat(at - 6)}${ch}"}`;

const inputs: Record<string, string> = {
  empty: "",
  whitespace: " \n\t  \r\n",
  valid: obj("PreToolUse"),
  validNewline: obj("PreToolUse") + "\n",
  trailingGarbage: obj("PreToolUse") + " garbage",
  twoObjects: obj("PreToolUse") + obj("Stop"),
  twoObjectsNewline: obj("PreToolUse") + "\n" + obj("Stop") + "\n",
  array: "[1,2,3]",
  arrayOfObjects: "[" + obj("Stop") + "]",
  scalarNumber: "42",
  scalarString: '"hello"',
  scalarNull: "null",
  malformed: '{"hook_event_name":"PreToolUse","a":',
  malformedBrace: '{"a":1,}',
  bom: "﻿" + obj("Stop"),
  nestedBraceAtEnd: '{"a":{"b":1}',
  // a 2-byte char (bytes 65535-65536) and a 4-byte char (65534-65537) straddle the 64 KiB chunk boundary
  multibyte2: withCharAt("é", 65535),
  multibyte4: withCharAt("😀", 65534),
  bigValid: obj("PostToolUse", 200_000),
  bigTwoObjects: obj("PostToolUse", 70_000) + obj("Stop", 70_000),
};

test("differential: new == old for every EOF-terminated input x randomized chunkings x caps", () => {
  const rand = rng(0xf00d);
  let cases = 0;
  for (const [name, text] of Object.entries(inputs)) {
    const bytes = Buffer.from(text, "utf8");
    const caps = [bytes.length, Math.max(1, bytes.length - 1), bytes.length + 1, 16 * 1024 * 1024, 1024];
    for (const cap of caps) {
      const random = Array.from({ length: 64 }, () => 1 + Math.floor(rand() * 70_000));
      const tiny = Array.from({ length: 64 }, () => 1 + Math.floor(rand() * 7));
      for (const plan of [[64 * 1024], [1], tiny, random, [65535], [65537, 3]]) {
        const oldB = legacyBounded(planRd(bytes, planOf(plan)), cap);
        const oldC = legacyCursor(planRd(bytes, planOf(plan)), cap);
        expect([name, cap, readBounded(-1, cap, chunked(bytes, planOf(plan)))]).toEqual([name, cap, oldB]);
        expect([name, cap, readCursorBounded(-1, cap, chunked(bytes, planOf(plan)))]).toEqual([name, cap, oldC]);
        cases += 2;
      }
    }
  }
  expect(cases).toBeGreaterThan(400);
}, 120000);

test("differential: default (no io) path stays the legacy blocking reader", () => {
  for (const [name, text] of Object.entries(inputs)) {
    const bytes = Buffer.from(text, "utf8");
    for (const cap of [bytes.length, 1024, 16 * 1024 * 1024]) {
      expect([name, viaFile(bytes, readBounded, cap)]).toEqual([name, viaFile(bytes, oldBounded, cap)]);
      expect([name, viaFile(bytes, readCursorBounded, cap)]).toEqual([name, viaFile(bytes, oldCursor, cap)]);
    }
  }
});

/** Records the `settle` flag of every pull while serving scripted chunks, then reports idle (null). */
function scripted(chunks: string[]): { io: StdinIo; flags: boolean[] } {
  const flags: boolean[] = [];
  let i = 0;
  return { flags, io: { early: true, pull: (settle) => { flags.push(settle); const c = chunks[i++]; return c === undefined ? null : Buffer.from(c); } } };
}

test("settle is requested only after one complete JSON object, and stays on (late bytes cannot repair it)", () => {
  const complete = scripted([obj("Stop"), "\n", " trailing"]);
  expect(readBounded(-1, 1 << 20, complete.io)).toEqual({ kind: "ok", text: obj("Stop") + "\n trailing" });
  // pull #1 (nothing yet) false; true once the object is complete, including after trailing whitespace/garbage chunks
  expect(complete.flags).toEqual([false, true, true, true]);

  const partial = scripted(['{"hook_event_name":"Stop"', ',"a":{"b":1}']);
  expect(readBounded(-1, 1 << 20, partial.io)).toEqual({ kind: "ok", text: '{"hook_event_name":"Stop","a":{"b":1}' });
  expect(partial.flags.every((f) => f === false)).toBe(true);
});

test("exact cap and cap+1 oversize boundaries match old", () => {
  const base = obj("PreToolUse");
  for (const cap of [base.length, base.length - 1, 4096]) {
    const bytes = Buffer.from(base);
    for (const plan of [[7], [64 * 1024]]) {
      expect(readBounded(-1, cap, chunked(bytes, planOf(plan)))).toEqual(legacyBounded(planRd(bytes, planOf(plan)), cap));
      expect(readCursorBounded(-1, cap, chunked(bytes, planOf(plan)))).toEqual(legacyCursor(planRd(bytes, planOf(plan)), cap));
    }
  }
});
