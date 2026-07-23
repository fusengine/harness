/**
 * Cross-process lock for session-track read-modify-write. The ~11-hook
 * fan-out races plain `loadTrack → mutate → saveTrack` (writes silently
 * lost — `refsRead` was the only mitigated channel, via its journal). This
 * lockfile (`wx`, atomic create) serializes the whole RMW:
 * - retry is bounded in TOTAL time (400 ms, far under any hook timeout);
 * - after the budget, NEVER crash: stderr is logged and the caller skips the
 *   write — a named lost write beats a fail-open crash (hook fail-open
 *   semantics preserved);
 * - an orphaned lockfile (dead process) is reclaimed after a 10 s TTL, so a
 *   crash mid-write never blocks a project forever.
 */
import { closeSync, existsSync, mkdirSync, openSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

/** Orphaned lockfile lifetime before reclamation. */
export const LOCK_TTL_MS = 10_000;
/** Total bounded retry budget before the write is skipped (fail-open). */
export const LOCK_RETRY_TOTAL_MS = 400;
/** Delay between two lock acquisition attempts. */
const RETRY_STEP_MS = 8;

/** Sentinel returned by {@link withTrackLock} when the lock could not be taken. */
export const LOCK_FAILED: unique symbol = Symbol("track-lock-failed");

/** True when the lockfile is older than the TTL (orphaned by a dead process). */
function isStale(lock: string): boolean {
  try { return Date.now() - statSync(lock).mtimeMs > LOCK_TTL_MS; } catch { return false; }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Run `fn` under the track lock of `dir`, or skip with a stderr note.
 * @param dir - The track state directory (lockfile lives inside).
 * @param fn - The protected read-modify-write.
 * @returns `fn`'s result, or {@link LOCK_FAILED} when the lock stayed busy.
 */
export async function withTrackLock<T>(dir: string, fn: () => Promise<T>): Promise<T | typeof LOCK_FAILED> {
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
      await sleep(RETRY_STEP_MS);
    }
  }
  try {
    return await fn();
  } finally {
    try { unlinkSync(lock); } catch { /* best-effort release */ }
  }
}

/** Test helper: true when a lockfile currently exists in `dir`. */
export function trackLockExists(dir: string): boolean {
  return existsSync(join(dir, "track.lock"));
}
