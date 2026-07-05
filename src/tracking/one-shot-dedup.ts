/**
 * @module one-shot-dedup
 * Burst-dedup guard for the one-shot metric ({@link module:one-shot}).
 *
 * ONE Claude tool event fans out to ~11 sibling plugin-hook processes, each
 * calling {@link recordOneShot}; without this the metric would count a single
 * deny/allow ~11×. Reuses the proven {@link oncePerWindow} cooldown sidecar:
 * the FIRST process in the {@link module:burst-window} window mutates the
 * metric, the rest skip. The dedup key includes the outcome KIND (deny-title vs
 * allow) so a deny and its later fix — different kinds — are never folded into
 * each other. No `sessionId` → always the first (mono-process + unit-test
 * parity; a burst can only exist when a real session drives the fan-out).
 * @packageDocumentation
 */
import { oncePerWindow } from "../runtime/inject-dedup";
import { BURST_DEDUP_MS } from "../runtime/burst-window";

/** Opts needed to decide + persist a burst claim (a structural subset of `OneShotOpts`). */
export interface BurstOpts { now: number; dir: string; sessionId?: string; }

/**
 * True when this `(op, kind)` is the FIRST of its burst for the session — the
 * process that should actually mutate the metric. Sibling processes firing the
 * SAME event within {@link BURST_DEDUP_MS} return false and skip the write.
 * @param op - Content-free operation key ({@link denyHash}("op", …)).
 * @param kind - Outcome discriminator (`deny:<title>` or `allow`).
 * @param opts - Clock + state dir + optional session id.
 * @returns `true` to apply the record, `false` to skip (already counted).
 */
export function burstFirst(op: string, kind: string, opts: BurstOpts): boolean {
  const sid = opts.sessionId?.trim();
  if (!sid) return true;
  return oncePerWindow(`oneshot:${sid}:${op}:${kind}`, BURST_DEDUP_MS, { now: opts.now, dir: opts.dir });
}
