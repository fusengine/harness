/**
 * Fixtures for the stdin differential: the OLD read-to-EOF readers copied
 * verbatim from git HEAD (only `readSync(fd, …)` became the injected `rd`, so
 * OLD and NEW can be fed identical chunk boundaries), plus chunk-plan helpers.
 */
import { readSync } from "node:fs";
import { CursorEventScanner } from "../src/cli/cursor-event-scanner";
import type { StdinIo } from "../src/cli/stdin-pull";

/** Result shape shared by the legacy and the new readers. */
export type Read = { kind: "ok"; text: string } | { kind: "oversize"; head: string };
/** One read: fill `buf` (up to `len`), return the byte count, 0 = EOF. Stands in for `readSync(fd, buf, 0, len, null)`. */
export type Rd = (buf: Buffer, len: number) => number;

const HEAD_BYTES = 4096;
const CHUNK = 64 * 1024;

/** OLD `readBounded` (src/cli/hook-io.ts at HEAD). */
export function legacyBounded(rd: Rd, maxBytes: number): Read {
  const buf = Buffer.alloc(CHUNK);
  const parts: Buffer[] = [];
  let total = 0;
  for (;;) {
    const n = rd(buf, CHUNK);
    if (n === 0) break;
    total += n;
    parts.push(Buffer.from(buf.subarray(0, n)));
    if (total > maxBytes) {
      return { kind: "oversize", head: Buffer.concat(parts).subarray(0, HEAD_BYTES).toString("utf8") };
    }
  }
  return { kind: "ok", text: Buffer.concat(parts).toString("utf8") };
}

/** OLD `readCursorBounded` (src/cli/cursor-stdin-reader.ts at HEAD). */
export function legacyCursor(rd: Rd, maxBytes: number): Read {
  const chunk = Buffer.alloc(CHUNK);
  const head = Buffer.alloc(HEAD_BYTES);
  const retained = Buffer.alloc(maxBytes);
  const scanner = new CursorEventScanner();
  let headLength = 0;
  let retainedLength = 0;
  let total = 0;
  let oversize = false;
  for (;;) {
    const length = rd(chunk, CHUNK);
    if (length === 0) break;
    const view = chunk.subarray(0, length);
    scanner.write(view);
    total += length;
    if (headLength < HEAD_BYTES) {
      const copied = Math.min(length, HEAD_BYTES - headLength);
      view.copy(head, headLength, 0, copied);
      headLength += copied;
    }
    if (!oversize) {
      const copied = Math.min(length, Math.max(0, maxBytes - retainedLength));
      if (copied > 0) view.copy(retained, retainedLength, 0, copied);
      retainedLength += copied;
      if (total > maxBytes) oversize = true;
    }
  }
  if (!oversize) return { kind: "ok", text: retained.subarray(0, total).toString("utf8") };
  const event = scanner.finish();
  return {
    kind: "oversize",
    head: event ? JSON.stringify({ hook_event_name: event }) : head.subarray(0, headLength).toString("utf8"),
  };
}

/** `Rd` over a real file descriptor. */
export const fdRd = (fd: number): Rd => (buf, len) => readSync(fd, buf, 0, len, null);

/** Cycle through a fixed size plan, so OLD and NEW readers see identical chunk boundaries. */
export function planOf(sizes: number[]): () => number {
  let i = 0;
  return () => sizes[i++ % sizes.length] as number;
}

/** `Rd` over `bytes` with the given chunk plan (a pipe returns <= len per read). */
export function planRd(bytes: Buffer, sizes: () => number): Rd {
  let at = 0;
  return (buf, len) => {
    const n = Math.min(bytes.length - at, len, sizes());
    bytes.copy(buf, 0, at, at + n);
    at += n;
    return n;
  };
}

/** NEW idle-aware io fed with the same chunk plan: serves every chunk (data already queued), then null (EOF or idle). */
export function chunked(bytes: Buffer, sizes: () => number): StdinIo {
  const rd = planRd(bytes, sizes);
  const buf = Buffer.alloc(CHUNK);
  return {
    early: true,
    pull: () => { const n = rd(buf, CHUNK); return n === 0 ? null : Buffer.from(buf.subarray(0, n)); },
  };
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
