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
import { existsSync, readFileSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { atomicWrite } from "../util/json-io";
import { emptyTrack, type SessionTrack } from "./session-state";
import { computeMac, loadOrCreateKey, signTrack, verifyTrack, writeLastNonce, type TrackEnvelope } from "./integrity";
import { foldEvents, type TrackEvent } from "./track-journal";
import { withTrackLock } from "./track-lock";
import { captureSpills, dropFiles, listCapturedSpills, listSpills, readSpillTexts, releaseSpills } from "./track-spill";

/** Compact when the log exceeds this size (bytes). */
export const COMPACT_BYTES: number = 128 * 1024;

/** Folded-spill nonces remembered in the snapshot (recovery only needs the last compaction's). */
const FOLDED_SPILLS_CAP = 2048;

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

/** Read & verify every event of a log PLUS its pending spill files (lock-free overflow, see track-spill.ts); absent/unreadable → [] (fail-open read). Deduped by nonce (an event is never counted twice); order = log, then spills (chronological) — foldEvents sorts stably on ts. */
export function readEvents(logPath: string): TrackEvent[] {
  let main: TrackEvent[] = [];
  try { main = parseEvents(readFileSync(logPath, "utf8")); } catch { /* no log */ }
  const seen = new Set<string>(), out: TrackEvent[] = [];
  for (const ev of [...main, ...readSpillTexts(logPath).flatMap(parseEvents)]) {
    if (!seen.has(ev.nonce)) { seen.add(ev.nonce); out.push(ev); }
  }
  return out;
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

/** Fold captured files (`.folding` log and/or captured spills) into the signed snapshot (signTrack + nonce, unchanged). Raw read, no spill discovery. */
function foldIntoSnapshot(file: string, captured: string[]): void {
  const base = readSnapshotSync(file);
  const done = new Set(base.foldedSpills ?? []);
  const seen = new Set<string>(), events: TrackEvent[] = [], spillNonces: string[] = [];
  for (const p of captured) {
    const isSpill = p.includes(".spill."); // the `.folding` LOG capture has no `.spill.` in its name
    for (const e of parseEvents(readFileSync(p, "utf8"))) {
      if (seen.has(e.nonce) || (isSpill && done.has(e.nonce))) continue; // idempotent re-fold of a crashed compaction
      seen.add(e.nonce); events.push(e);
      if (isSpill) spillNonces.push(e.nonce);
    }
  }
  const folded = foldEvents(events, base);
  // same atomic write as the events; the cap never truncates below one whole fold
  if (spillNonces.length) folded.foldedSpills = [...(base.foldedSpills ?? []), ...spillNonces].slice(-Math.max(FOLDED_SPILLS_CAP, spillNonces.length));
  const envelope = signTrack(folded);
  atomicWrite(file, JSON.stringify(envelope, null, 2));
  writeLastNonce(envelope.nonce);
}

/** Rename-atomic compaction: rename captures the WHOLE log (and every pending spill), fold, unlink. A crash leaves `.folding` captures (recovered first next run); on fold failure BEFORE commit they are renamed back — never a lost event, and never an event in BOTH snapshot and log (no double-count). Spills are deleted only AFTER the snapshot is durably written. */
function compactSync(file: string): void {
  const log = journalLogPath(file), folding = `${log}.folding`;
  const left = [...(existsSync(folding) ? [folding] : []), ...listCapturedSpills(log)];
  if (left.length) { foldIntoSnapshot(file, left); dropFiles(left); } // crashed compaction recovery
  const hasLog = existsSync(log);
  if (hasLog) renameSync(log, folding); // atomic capture; the next append recreates a fresh log
  const spills = captureSpills(log);
  const captured = [...(hasLog ? [folding] : []), ...spills];
  if (!captured.length) return;
  let committed = false;
  try {
    foldIntoSnapshot(file, captured);
    committed = true; // the snapshot now HOLDS the events: never return them to the log
    dropFiles(captured);
  } catch (err) {
    if (!committed) { if (hasLog) { try { renameSync(folding, log); } catch { /* keep .folding for recovery */ } } releaseSpills(spills); }
    else dropFiles(captured); // residue iff unlink itself failed
    throw err;
  }
}

/** Trigger compaction past the cap (`FUSE_TRACK_COMPACT_BYTES` overrides {@link COMPACT_BYTES}), under the existing lock (skipped on contention). */
export async function maybeCompactJournal(file: string): Promise<void> {
  const cap = Number(process.env.FUSE_TRACK_COMPACT_BYTES) || COMPACT_BYTES;
  let size = -1; // no log yet
  try { size = statSync(journalLogPath(file)).size; } catch { /* spills may still be pending */ }
  const lp = journalLogPath(file);
  // pending spills or crashed-compaction captures always trigger an absorb/recovery
  if (size < cap && !listSpills(lp).length && !listCapturedSpills(lp).length && !existsSync(`${lp}.folding`)) return;
  await withTrackLock(dirname(file), async () => {
    try { compactSync(file); } catch { /* rare path: the next trigger retries */ }
  });
}
