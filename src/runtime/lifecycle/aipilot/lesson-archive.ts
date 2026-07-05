/**
 * Stage 1 — cap→archive split for LESSON.md. When deduped bullets exceed CAP the
 * OLDEST excess is MOVED (never deleted) to LESSON-archive.md, EXCEPT a
 * `[TRIGGERS …]` bullet younger than STALE_DAYS: archiving it would blind the
 * PreToolUse trigger index (src/policy/lessons/trigger-index reads LESSON.md), so
 * it stays even past the cap. Pure: this module decides the partition and renders
 * the archive block; the fail-safe, archive-first file write is the caller's job.
 */
import { CAP, DAY_MS, STALE_DAYS, type Block, hasTrigger } from "./lesson-parse";

/** Sort key: undated bullets sort oldest, so malformed entries archive first. */
function age(b: Block): number { return Number.isNaN(b.ts) ? -Infinity : b.ts; }

/** A TRIGGERS bullet is protected from archival until older than STALE_DAYS. */
function isProtected(b: Block, staleBefore: number): boolean {
  return hasTrigger(b) && !(b.ts <= staleBefore);
}

/**
 * Partition deduped `blocks` (newest-first file order) into the bullets that
 * stay in LESSON.md and the oldest excess to archive. Archives only enough to
 * reach CAP, skipping protected TRIGGERS bullets (so the file MAY stay slightly
 * over cap by design). Order is preserved in both halves; `keep ∪ archive` is
 * exactly `blocks` with no loss and no mutation.
 * @param blocks - Deduped bullets, newest first.
 * @param now - Clock (ms) for the STALE_DAYS protection window.
 * @returns `{ keep, archive }` — a lossless partition of `blocks`.
 */
export function splitAtCap(blocks: Block[], now: number): { keep: Block[]; archive: Block[] } {
  if (blocks.length <= CAP) return { keep: blocks, archive: [] };
  const staleBefore = now - STALE_DAYS * DAY_MS;
  const oldestFirst = [...blocks].sort((a, b) => age(a) - age(b));
  const toArchive = new Set<Block>();
  let excess = blocks.length - CAP;
  for (const b of oldestFirst) {
    if (excess <= 0) break;
    if (isProtected(b, staleBefore)) continue;
    toArchive.add(b);
    excess--;
  }
  return {
    keep: blocks.filter((b) => !toArchive.has(b)),
    archive: blocks.filter((b) => toArchive.has(b)),
  };
}

/**
 * Render `archive` bullets as a dated block to PREPEND to LESSON-archive.md
 * (newest archive session on top). Bullets are emitted BYTE-IDENTICAL (raw lines
 * rejoined) — zero mutation, so the move stays reversible/auditable.
 * @param archive - Bullets chosen by {@link splitAtCap}.
 * @param now - Clock (ms) for the archival header date.
 * @returns The block text (trailing newline), or "" when nothing is archived.
 */
export function formatArchive(archive: Block[], now: number): string {
  if (archive.length === 0) return "";
  const day = new Date(now).toISOString().slice(0, 10);
  const header = `<!-- archived ${day}: ${archive.length} bullet(s) moved from LESSON.md at cap ${CAP} -->`;
  return `${header}\n${archive.map((b) => b.raw.join("\n")).join("\n\n")}\n`;
}
