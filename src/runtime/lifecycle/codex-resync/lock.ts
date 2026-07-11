import { mkdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Stale-after window (ms) — survives a session crashing before its `finally`. */
const STALE_MS = 30_000;

function lockPath(codexHome: string): string {
  return join(codexHome, "fusengine", "state", "agents-resync.lock");
}

/**
 * Best-effort inter-process lock for the agents resync. `writeFileSync(path,
 * pid, { flag: "wx" })` uses `O_EXCL`: it fails with `EEXIST` when the lock
 * file already exists, so two Codex sessions starting at once cannot both
 * resolve then write DIFFERENT versions of the agents cache in interleave (a
 * torn TOML). Stale after {@link STALE_MS} to survive a crash that never
 * reached its `finally`. No live-PID check (a permanent, accepted limit of any
 * mtime-based lock — same tradeoff `proper-lockfile` makes).
 * @param codexHome - The Codex home directory.
 * @returns `true` when the lock was acquired; `false` when another live
 * holder has it.
 */
export function acquireResyncLock(codexHome: string): boolean {
  const path = lockPath(codexHome);
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(path, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    try {
      if (Date.now() - statSync(path).mtimeMs <= STALE_MS) return false;
      unlinkSync(path);
      writeFileSync(path, String(process.pid), { flag: "wx" });
      return true;
    } catch {
      return false;
    }
  }
}

/** Release the lock. Best-effort — never throws. */
export function releaseResyncLock(codexHome: string): void {
  try {
    unlinkSync(lockPath(codexHome));
  } catch { /* best-effort */ }
}
