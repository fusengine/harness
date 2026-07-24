/**
 * @module track-diff
 * Derive journal events from a track mutation (prev → next), so journal-mode
 * writers keep the existing immutable-mutator API unchanged: run the pure
 * mutator in memory, then append ONLY what changed. The per-field mapping
 * mirrors the fold table in track-journal.ts (adds/maxes/appends/merges/sets;
 * evictions are NOT events — the fold's sliding-window re-filter owns those).
 * @packageDocumentation
 */
import type { SessionTrack } from "./session-state";

/** An unsigned event ready for {@link appendEvent}. */
export type RawEvent = { field: string; op: "add" | "max" | "append" | "merge" | "set"; value: unknown; ts: number };

/** Elements of `next` beyond the longest prefix shared with `prev` (append-only arrays). */
function tail<T>(prev: T[], next: T[]): T[] {
  let i = 0;
  while (i < prev.length && i < next.length && JSON.stringify(prev[i]) === JSON.stringify(next[i])) i++;
  return next.slice(i);
}

/** Multiset of added numbers (next counts minus prev counts). */
function added(xs: number[], ys: number[]): number[] {
  const left = new Map<number, number>();
  for (const x of xs) left.set(x, (left.get(x) ?? 0) + 1);
  const out: number[] = [];
  for (const y of ys) {
    const n = left.get(y) ?? 0;
    if (n > 0) left.set(y, n - 1);
    else out.push(y);
  }
  return out;
}

/** Events replaying `next` over `prev` (empty when the mutation was a no-op). */
export function diffTrackEvents(prev: SessionTrack, next: SessionTrack, now: number): RawEvent[] {
  if (prev === next) return [];
  const out: RawEvent[] = [];
  for (const p of next.refsRead) if (!prev.refsRead.includes(p)) out.push({ field: "refsRead", op: "add", value: p, ts: next.refsReadAt?.[p] ?? now });
  for (const [p, ts] of Object.entries(next.refsReadAt ?? {})) if (ts !== prev.refsReadAt?.[p]) out.push({ field: "refsReadAt", op: "max", value: [p, ts], ts });
  for (const a of tail(prev.agents, next.agents)) out.push({ field: "agents", op: "append", value: a, ts: a.ts ?? now });
  for (const r of tail(prev.receipts ?? [], next.receipts ?? [])) out.push({ field: "receipts", op: "append", value: r, ts: r.ts ?? now });
  for (const [key, entry] of Object.entries(next.authorizations)) {
    if (JSON.stringify(entry) !== JSON.stringify(prev.authorizations[key])) out.push({ field: "authorizations", op: "merge", value: { key, entry }, ts: Date.parse(entry.doc_consulted ?? "") || now });
  }
  for (const ts of added(prev.trivialEdits ?? [], next.trivialEdits ?? [])) out.push({ field: "trivialEdits", op: "add", value: ts, ts });
  if (next.target && JSON.stringify(next.target) !== JSON.stringify(prev.target)) out.push({ field: "target", op: "set", value: next.target, ts: Date.parse(next.target.set_at) || now });
  if (next.brainstormRequired !== prev.brainstormRequired) out.push({ field: "brainstormRequired", op: "set", value: next.brainstormRequired, ts: now });
  return out;
}
