/**
 * @module track-compact
 * Read side + compaction for the track journal (see track-journal.ts):
 * - {@link parseEvents}/{@link readEvents}: MAC-verified replay — a tampered
 *   line is dropped, never the whole file (fail-closed PER LINE);
 * - {@link readTrackSync}: the sync snapshot ⊕ journal read for the sync gates;
 * - {@link maybeCompactJournal}: past {@link COMPACT_BYTES}, fold the log into
 *   the signed snapshot — RENAME-ATOMIC (logrotate pattern) under the EXISTING
 *   track lock (rare, skipped on contention). Lock-free appends stay SAFE in
 *   both race windows: before the rename → captured by the fold; after → a
 *   fresh log at the original path (appendFileSync keeps no fd across calls).
 * @packageDocumentation
 */
import { existsSync, readFileSync, renameSync, statSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { atomicWrite } from "../util/json-io";
import { emptyTrack, type SessionTrack } from "./session-state";
import { computeMac, loadOrCreateKey, signTrack, verifyTrack, writeLastNonce, type TrackEnvelope } from "./integrity";
import { foldEvents, type TrackEvent } from "./track-journal";
import { withTrackLock } from "./track-lock";

/** Compact when the log exceeds this size (bytes). */
export const COMPACT_BYTES: number = 128 * 1024;

/** The journal log path twin of a track snapshot path. */
export function journalLogPath(trackPath: string): string {
  return trackPath.replace(/\.json$/, ".log");
}

/** Parse & MAC-verify journal text; malformed or tampered lines are skipped. */
export function parseEvents(text: string): TrackEvent[] {
  const key = loadOrCreateKey(), out: TrackEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      const ev = JSON.parse(line) as TrackEvent;
      if (ev?.v !== 1 || typeof ev.nonce !== "string" || typeof ev.ts !== "number") continue;
      if (ev.mac !== computeMac(key, JSON.stringify({ field: ev.field, op: ev.op, value: ev.value, ts: ev.ts }), ev.nonce)) continue; // fail-closed per line
      out.push(ev);
    } catch { /* skip the bad line, keep the rest */ }
  }
  return out;
}

/** Read & verify every event of a log; absent/unreadable → [] (fail-open read). */
export function readEvents(logPath: string): TrackEvent[] {
  try { return parseEvents(readFileSync(logPath, "utf8")); } catch { return []; }
}

/** Verified legacy snapshot only (fail-closed → emptyTrack), sync. */
function readSnapshotSync(file: string): SessionTrack {
  try {
    return verifyTrack(JSON.parse(readFileSync(file, "utf8")) as TrackEnvelope) ?? emptyTrack();
  } catch {
    return emptyTrack();
  }
}

/** Sync snapshot ⊕ journal read for the sync gates; `journal=false` = legacy kill-switch path. */
export function readTrackSync(file: string, journal: boolean): SessionTrack {
  const base = readSnapshotSync(file);
  return journal ? foldEvents(readEvents(journalLogPath(file)), base) : base;
}

/** Fold a whole log file into the signed snapshot (signTrack + nonce, unchanged). */
function foldIntoSnapshot(file: string, logPath: string): void {
  const envelope = signTrack(foldEvents(readEvents(logPath), readSnapshotSync(file)));
  atomicWrite(file, JSON.stringify(envelope, null, 2));
  writeLastNonce(envelope.nonce);
}

/** Rename-atomic compaction: rename captures the WHOLE log, fold, unlink. A crash leaves `.folding` (recovered first next run); on fold failure BEFORE commit the log is renamed back — never a lost event, and never an event in BOTH snapshot and log (no double-count). */
function compactSync(file: string): void {
  const log = journalLogPath(file), folding = `${log}.folding`;
  if (existsSync(folding)) { foldIntoSnapshot(file, folding); unlinkSync(folding); } // crashed compaction recovery
  renameSync(log, folding); // atomic capture; the next append recreates a fresh log
  let committed = false;
  try {
    foldIntoSnapshot(file, folding);
    committed = true; // the snapshot now HOLDS the events: never return them to the log
    unlinkSync(folding);
  } catch (err) {
    if (!committed) { try { renameSync(folding, log); } catch { /* keep .folding for recovery */ } }
    else { try { unlinkSync(folding); } catch { /* residue iff unlink itself failed */ } }
    throw err;
  }
}

/** Trigger compaction past the cap (`FUSE_TRACK_COMPACT_BYTES` overrides {@link COMPACT_BYTES}), under the existing lock (skipped on contention). */
export async function maybeCompactJournal(file: string): Promise<void> {
  try {
    const cap = Number(process.env.FUSE_TRACK_COMPACT_BYTES) || COMPACT_BYTES;
    if (statSync(journalLogPath(file)).size < cap) return;
  } catch {
    return; // no log yet
  }
  await withTrackLock(dirname(file), async () => {
    try { compactSync(file); } catch { /* rare path: the next trigger retries */ }
  });
}
