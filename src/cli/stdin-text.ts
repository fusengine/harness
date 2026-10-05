/**
 * Light stdin text reader for `harness hook` — the part of `hook-io.ts` that
 * needs no runtime/adapters, so a rendezvous follower can read + hash its
 * payload WITHOUT loading the heavy module graph. `hook-io.ts` re-exports
 * everything here (public API and tests unchanged).
 *
 * Tracing is stderr-only and active only when FUSE_HARNESS_DEBUG=1 AND
 * CI=true (both set by test/sim/exec.ts; never in an interactive session).
 */
import { resolveStdinMaxBytes } from "../config/limits";
import { readCursorBounded } from "./cursor-stdin-reader";
import { CompletionTracker, syncPull, type StdinIo } from "./stdin-pull";
import { openIdleAwareStdin, stopStdinReader } from "./stdin-source";

const hookDebug = process.env.FUSE_HARNESS_DEBUG === "1" && process.env.CI === "true";

/** stderr-only trace, no-op outside the debug flag combination above. */
export function traceHook(label: string, data: unknown): void {
  if (hookDebug) process.stderr.write(`[hook-debug] ${label}: ${typeof data === "string" ? data : JSON.stringify(data)}\n`);
}

/** Result of the bounded stdin read. */
export type StdinRead =
  | { kind: "ok"; text: string }
  | { kind: "oversize"; head: string; stalled?: boolean };

/** First 4 KiB are the fallback diagnostic probe when no event key is found. */
export const HEAD_BYTES = 4096;
const CURSOR_MAX_STDIN_BYTES = 64 * 1024 * 1024;

/** Resolve and clamp Cursor's stdin cap while preserving other harness limits. */
export function resolveCursorStdinMaxBytes(env: Record<string, string | undefined> = process.env): number {
  return Math.min(CURSOR_MAX_STDIN_BYTES, resolveStdinMaxBytes(env));
}

/**
 * Read a file descriptor to EOF, bounded at `maxBytes` (+1 byte to detect
 * the overflow). Injectable fd so tests never touch process stdin.
 * With an idle-aware `io` it also stops early on a complete top-level JSON
 * object (after the settle grace) or when the idle window expires — both end
 * exactly like the EOF they replace.
 * @param fd - The descriptor to read (0 in production).
 * @param maxBytes - Cap from {@link resolveStdinMaxBytes}.
 * @param io - Chunk source; defaults to the blocking read-to-EOF of `fd`.
 */
export function readBounded(fd: number, maxBytes: number, io: StdinIo = { pull: syncPull(fd) }): StdinRead {
  const parts: Buffer[] = [];
  const done = io.early ? new CompletionTracker() : undefined;
  let total = 0;
  let settle = false;
  for (;;) {
    const chunk = io.pull(settle);
    if (!chunk) break;
    total += chunk.length;
    parts.push(Buffer.from(chunk));
    if (total > maxBytes) {
      return { kind: "oversize", head: Buffer.concat(parts).subarray(0, HEAD_BYTES).toString("utf8") };
    }
    if (done) settle = done.update(chunk, () => Buffer.concat(parts));
  }
  if (io.stalled?.()) {
    return { kind: "oversize", head: Buffer.concat(parts).subarray(0, HEAD_BYTES).toString("utf8"), stalled: true };
  }
  traceHook("stdin-text-length", total);
  return { kind: "ok", text: Buffer.concat(parts).toString("utf8") };
}

/**
 * Read hook stdin (bounded, idle-aware) WITHOUT parsing it. The Cursor reader
 * differs only in its scanner/cap; both end in the same {@link StdinRead}.
 * @param id - Harness id (selects the Cursor reader + cap).
 */
export async function readStdinRead(id?: string): Promise<StdinRead> {
  const cap = id === "cursor" ? resolveCursorStdinMaxBytes() : resolveStdinMaxBytes();
  const io = await openIdleAwareStdin();
  try { return id === "cursor" ? readCursorBounded(0, cap, io) : readBounded(0, cap, io); }
  finally { stopStdinReader(); } // disarm: nothing may keep polling stdin while the hook runs
}
