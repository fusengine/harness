/**
 * Append-only journal of `.md` reference reads — the FRESH, race-immune companion
 * to {@link reconcileRefReadsFromTranscript}.
 *
 * WHY a third source (track + transcript were not enough for teammates): the live
 * session track write is a non-atomic load→mutate→save, so under the multi-plugin
 * hook fan-out (one process per plugin, ×N) a lone `refsRead` write is clobbered
 * (lost update). The transcript reconcile recovers the LEAD's lost reads because,
 * by the time the lead edits, its Read has flushed to the platform transcript. But
 * the platform flushes that JSONL to disk with a MULTI-MINUTE lag (measured ~230s,
 * well past the 120s freshness TTL): a background TEAMMATE reads the exact listed
 * ref then edits within seconds — far faster than the flush — so the transcript on
 * disk does NOT yet contain the teammate's read, reconcile misses it, and (its live
 * track write having been lost to the fan-out) solidReadGate blocks despite a
 * genuine read. That is the "teammate solidRead" gap.
 *
 * This journal closes it: every credited `.md` read is appended (one JSON line) the
 * instant PostToolUse fires — O_APPEND is per-write atomic, so concurrent fan-out
 * processes each add their own line and none is lost, and there is no flush lag. The
 * gate folds it back BEFORE any refsRead consumer, alongside the transcript.
 *
 * ANTI-FORGERY: it lives in the out-of-tree state dir the protected-path guard
 * denies agents from writing (SAME boundary as the signed track); the only writer is
 * our PostToolUse on a real `.md` Read. COST: the gate reads it once per edit, bounded
 * by {@link appendRefRead}'s trim cap — cheaper than the multi-MB transcript parse.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readText } from "../util/runtime-io";
import { trimLogFile } from "../runtime/fs-cleanup";
import { recordRefRead, type SessionTrack } from "../tracking/session-state";

/** Journal filename inside the per-session state dir. */
const JOURNAL = "refs-read.log";

/** One journalled read: `.md` path plus the tool event's epoch-ms timestamp. */
interface RefReadLine {
  p: string;
  t: number;
}

/**
 * Append a credited `.md` read to the state-dir journal (O_APPEND, atomic under
 * the fan-out). No-op for non-`.md` paths (parity with the reconcile filter).
 * Fully fail-open: a mkdir/append error is swallowed so recording never blocks the
 * PostToolUse path.
 * @param dir - Per-session state dir (`dirname(trackFile)`).
 * @param path - The read file's absolute path.
 * @param ts - The tool event's epoch-ms timestamp.
 */
export function appendRefRead(dir: string, path: string, ts: number): void {
  if (!path.endsWith(".md")) return;
  try {
    mkdirSync(dir, { recursive: true });
    const file = join(dir, JOURNAL);
    appendFileSync(file, JSON.stringify({ p: path, t: ts } satisfies RefReadLine) + "\n", "utf-8");
    trimLogFile(file, 128 * 1024, 1_000); // bound the SHARED cross-session log: keep the recent tail (only fresh reads credit a gate)
  } catch {
    /* fail-open: a missing dir or write error must never break recording */
  }
}

/**
 * Fold every `.md` read in the state-dir journal into `track` (immutably), each
 * stamped with its journalled timestamp and never rolling back a MORE-recent
 * existing stamp — identical merge semantics to
 * {@link reconcileRefReadsFromTranscript}, but from the fresh append-only journal
 * instead of the lagged transcript. Fail-open: an absent/unreadable journal returns
 * `track` unchanged (same reference).
 * @param track - The current (possibly race-damaged) session track.
 * @param dir - Per-session state dir (`dirname(trackFile)`).
 * @param now - Fallback epoch-ms for entries with an invalid timestamp.
 * @returns The track with journalled `.md` reads merged into `refsRead`/`refsReadAt`.
 */
export function reconcileRefReadsFromJournal(track: SessionTrack, dir: string, now: number): SessionTrack {
  let text: string;
  try {
    text = readText(join(dir, JOURNAL));
  } catch {
    return track; // unreadable → unchanged (no regression)
  }
  let next = track;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry: RefReadLine;
    try {
      entry = JSON.parse(line) as RefReadLine;
    } catch {
      continue; // tolerate malformed lines
    }
    const path = typeof entry.p === "string" ? entry.p : "";
    if (!path.endsWith(".md")) continue;
    const ts = typeof entry.t === "number" && Number.isFinite(entry.t) ? entry.t : now;
    const prev = next.refsReadAt?.[path];
    if (prev === undefined || prev < ts) next = recordRefRead(next, path, ts);
  }
  return next;
}
