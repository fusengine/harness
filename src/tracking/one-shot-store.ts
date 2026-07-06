/**
 * @module one-shot-store
 * Pure, IO-free state model for the per-gate one-shot metric ({@link module:one-shot}).
 *
 * Measures the owner's "precision / one-shot" criterion: per gate (keyed by the
 * block prompt's title) how many times it DENIED and how many were later cleared
 * by an allow of the same operation (a fix). Globally: `firstTry` (a gateable op
 * that passed with NO prior deny = one-shot) vs `corrected` (passed after a deny).
 * The store ({@link module:one-shot}) loads, persists, and wires this into the gate.
 * @packageDocumentation
 */

/** Per-gate tally: total denies, denies later fixed by an allow, last-seen clock. */
export interface GateStat { denies: number; corrected: number; lastTs: number; }

/** One open deny awaiting its fix: the blocking gate title and when it landed. */
export interface Pending { title: string; ts: number; }

/** Aggregate one-shot state (a sidecar JSON). `pending` links a deny to its later allow. */
export interface OneShotState {
  gates: Record<string, GateStat>;
  firstTry: number;
  corrected: number;
  pending: Record<string, Pending>;
  updatedAt: number;
  /** Per-tool PostToolUseFailure tally. Optional — absent in pre-0.1.57 sidecars (additive, back-compatible). */
  failures?: Record<string, number>;
}

/** A fresh, empty state — always spread (`{ ...EMPTY }`) so the const is never shared. */
export const EMPTY: OneShotState = { gates: {}, firstTry: 0, corrected: 0, pending: {}, updatedAt: 0 };

/**
 * Drop stale data: whole-state idle reset past the window, else per-entry prune of
 * gates/pending older than `windowMs`. Keeps the "7d" window honest, bounds size.
 */
export function pruneState(s: OneShotState, now: number, windowMs: number): OneShotState {
  if (now - s.updatedAt >= windowMs) return { ...EMPTY };
  const gates: Record<string, GateStat> = {};
  for (const [k, g] of Object.entries(s.gates)) if (now - g.lastTs < windowMs) gates[k] = g;
  const pending: Record<string, Pending> = {};
  for (const [k, p] of Object.entries(s.pending)) if (now - p.ts < windowMs) pending[k] = p;
  return { ...s, gates, pending };
}

/**
 * Record a deny for gate `title` on operation `op` (content-free tool identity):
 * bump the gate's deny count and mark `op` pending for a later fix.
 */
export function applyDeny(s: OneShotState, title: string, op: string, now: number): OneShotState {
  const g = s.gates[title] ?? { denies: 0, corrected: 0, lastTs: 0 };
  return {
    ...s,
    gates: { ...s.gates, [title]: { denies: g.denies + 1, corrected: g.corrected, lastTs: now } },
    pending: { ...s.pending, [op]: { title, ts: now } },
    updatedAt: now,
  };
}

/**
 * Record an allow for a gateable `op`. A non-gateable allow (Read/Task/MCP) leaves
 * state untouched — it never counts and never clears a pending deny. Otherwise: a
 * pending deny → `corrected` (a fix, credited to the blocking gate); no pending →
 * `firstTry` (one-shot).
 */
export function applyAllow(s: OneShotState, op: string, now: number, gateable: boolean): OneShotState {
  if (!gateable) return s;
  const pend = s.pending[op];
  if (pend) {
    const g = s.gates[pend.title] ?? { denies: 0, corrected: 0, lastTs: 0 };
    const { [op]: _drop, ...pending } = s.pending;
    return {
      ...s,
      gates: { ...s.gates, [pend.title]: { ...g, corrected: g.corrected + 1, lastTs: now } },
      corrected: s.corrected + 1, pending, updatedAt: now,
    };
  }
  return gateable ? { ...s, firstTry: s.firstTry + 1, updatedAt: now } : s;
}

/**
 * Compact injectable summary (one line); "" when there is nothing to report.
 * @returns e.g. `gates 7d: 88% one-shot (44/50 clean); SOLID file-size limit 4den/3fix`.
 */
export function formatSummary(s: OneShotState): string {
  const keys = Object.keys(s.gates);
  const total = s.firstTry + s.corrected;
  if (keys.length === 0 && total === 0) return "";
  const head = total > 0 ? `${Math.round((s.firstTry / total) * 100)}% one-shot (${s.firstTry}/${total} clean)` : "no clean pass yet";
  const parts = keys
    .map((k) => ({ k, g: s.gates[k]! }))
    .sort((a, b) => b.g.denies - a.g.denies)
    .map(({ k, g }) => `${k} ${g.denies}den/${g.corrected}fix`);
  return `gates 7d: ${head}${parts.length ? `; ${parts.join("; ")}` : ""}`;
}
