/**
 * @module track-spill
 * Lock-free, collision-free overflow for the journal append path. When the
 * bounded `track.lock` wait expires (track-lock-sync), the signed event is
 * written to its OWN file `<log>.spill.<ms>-<pid>-<rand>` (tmp + fsync +
 * atomic rename, so a reader never sees a partial line) — never to the log,
 * hence it cannot race the compaction's rename/fold/unlink. Readers fold
 * spills in (track-compact `readEvents`); the compactor CAPTURES them
 * (rename to `.folding`, the same logrotate pattern as the log), folds, and
 * deletes them only after the snapshot is durably written.
 * @packageDocumentation
 */
import { closeSync, fsyncSync, openSync, readdirSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import type { TrackEvent } from "./track-journal";

/** Suffix of a spill file captured by a compaction (invisible to readers). */
const CAPTURED = ".folding";
const SPILL_RE = /\.spill\.[0-9]+-[0-9]+-[0-9a-f]+$/;

/** Write one signed event line to a fresh spill file beside `logPath` (throws on I/O error). */
export function spillEvent(logPath: string, ev: TrackEvent): void {
  const dest = `${logPath}.spill.${Date.now()}-${process.pid}-${randomBytes(6).toString("hex")}`;
  const tmp = `${dest}.tmp`;
  const fd = openSync(tmp, "wx");
  try {
    writeSync(fd, JSON.stringify(ev) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, dest); // atomic publish: readers only match complete `.spill.*` names
}

function matching(logPath: string, captured: boolean): string[] {
  const dir = dirname(logPath), prefix = `${basename(logPath)}.spill.`;
  try {
    return readdirSync(dir)
      .filter((n) => n.startsWith(prefix) && (captured ? n.endsWith(CAPTURED) && SPILL_RE.test(n.slice(0, -CAPTURED.length)) : SPILL_RE.test(n)))
      .sort() // ms-pid-rand: chronological, stable tiebreak
      .map((n) => join(dir, n));
  } catch { return []; }
}

/** Pending (published, not yet captured) spill files of `logPath`, ordered. */
export function listSpills(logPath: string): string[] { return matching(logPath, false); }

/** Spill files already captured by a (possibly crashed) compaction, ordered. */
export function listCapturedSpills(logPath: string): string[] { return matching(logPath, true); }

/** Raw text of every pending spill, in order (unreadable/just-captured files skipped). */
export function readSpillTexts(logPath: string): string[] {
  const out: string[] = [];
  for (const p of listSpills(logPath)) { try { out.push(readFileSync(p, "utf8")); } catch { /* captured meanwhile */ } }
  return out;
}

/** Atomically capture the pending spills (rename → `.folding`); returns the captured paths. */
export function captureSpills(logPath: string): string[] {
  const out: string[] = [];
  for (const p of listSpills(logPath)) { try { renameSync(p, p + CAPTURED); out.push(p + CAPTURED); } catch { /* raced */ } }
  return out;
}

/** Return captured spills to the pending set (fold failed BEFORE commit). */
export function releaseSpills(captured: string[]): void {
  for (const p of captured) { try { renameSync(p, p.slice(0, -CAPTURED.length)); } catch { /* kept for recovery */ } }
}

/** Delete captured spills (after their events are durably in the snapshot). */
export function dropFiles(paths: string[]): void {
  for (const p of paths) { try { unlinkSync(p); } catch { /* residue */ } }
}
