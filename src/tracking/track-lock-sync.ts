/**
 * Synchronous twin of {@link withTrackLock} for lifecycle paths that CANNOT
 * float async work (the SubagentStop dispatch runs synchronously in a
 * short-lived hook process — an async write could be dropped before exit,
 * see `evidence-harvest-io.ts`). Same semantics: `wx` lockfile, bounded total
 * retry, named skipped write on contention, stale reclamation. The wait uses
 * `Atomics.wait` (allowed on the main thread in both Node and Bun).
 */
import { closeSync, mkdirSync, openSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { LOCK_FAILED, LOCK_RETRY_TOTAL_MS, LOCK_TTL_MS } from "./track-lock";

export { LOCK_FAILED } from "./track-lock";

/** Block the thread for `ms` (bounded by the caller's total budget). */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** True when the lockfile is older than the TTL (orphaned by a dead process). */
function isStale(lock: string): boolean {
  try { return Date.now() - statSync(lock).mtimeMs > LOCK_TTL_MS; } catch { return false; }
}

/**
 * Run `fn` under the track lock of `dir`, synchronously.
 * @param dir - The track state directory (lockfile lives inside).
 * @param fn - The protected read-modify-write.
 * @returns `fn`'s result, or {@link LOCK_FAILED} when the lock stayed busy.
 */
export function withTrackLockSync<T>(dir: string, fn: () => T): T | typeof LOCK_FAILED {
  mkdirSync(dir, { recursive: true });
  const lock = join(dir, "track.lock");
  const deadline = Date.now() + LOCK_RETRY_TOTAL_MS;
  for (;;) {
    try {
      const fd = openSync(lock, "wx");
      closeSync(fd);
      break;
    } catch {
      if (isStale(lock)) { try { unlinkSync(lock); } catch { /* raced */ } continue; }
      if (Date.now() >= deadline) {
        process.stderr.write(`harness: track lock busy, write skipped (${lock})\n`);
        return LOCK_FAILED;
      }
      sleepSync(8);
    }
  }
  try {
    return fn();
  } finally {
    try { unlinkSync(lock); } catch { /* best-effort release */ }
  }
}
