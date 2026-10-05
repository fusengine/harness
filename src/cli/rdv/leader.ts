/**
 * The leader's loop: run, one after the other, the scope of every registration
 * of the event (its own included), publishing each answer as `res-<name>`.
 * Heavy (imports the runtime through `unit.ts`) — loaded only by the process
 * that won the election.
 *
 * Guarantees (see `follower.ts` for the other half):
 *  - a scope runs at most once: it is claimed (O_EXCL) right before it runs;
 *  - shortest-expected-first (`stats.ts`), and a scope expected to be slow is
 *    handed back to its own process (`decline`) so it never queues the others;
 *  - past the budget the leader stops claiming and declines the rest, so it
 *    never outlives the tightest host handler timeout;
 *  - a registration whose frozen env (HOME…) differs is declined, not bent;
 *  - nothing here may throw once the leader's own scope ran (it would run twice).
 */
import { appendFileSync, readdirSync } from "node:fs";
import { readText, sleepSync, tryExclusive, writeAtomic } from "./fs";
import { layout, sortedRegNames } from "./layout";
import { eventNameOf, loadStats, observe, saveStats, statKey } from "./stats";
import type { RdvContext, Registration, ResultFile, UnitResult } from "./types";
import { envSignature, runRegistration } from "./unit";
import { sweep } from "./sweep";

/** Run `fn`, swallowing any fault (publishing/diagnostics must never undo a finished run). */
function safe(fn: () => void): void {
  try { fn(); } catch { /* best effort */ }
}

/**
 * Serve every registration of the event; return the leader's own result.
 * @param ctx - The leader's context (payload, tuning, spawn env).
 * @param dir - The event directory.
 * @param ownName - The leader's own registration name.
 * @returns The leader's own result, or null when it could not run its own scope (caller runs standalone).
 */
export async function lead(ctx: RdvContext, dir: string, ownName: string): Promise<UnitResult | null> {
  const { quietMs, budgetMs, pollMs, slowMs } = ctx.tuning;
  const t0 = Date.now();
  const sig = envSignature(ctx.env);
  const event = eventNameOf(ctx.text);
  const stats = loadStats(ctx.root);
  const done = new Set<string>();
  const regs = new Map<string, Registration | null>();
  let own: UnitResult | undefined;

  const regOf = (name: string): Registration | null => {
    if (!regs.has(name)) {
      try { regs.set(name, JSON.parse(readText(layout.reg(dir, name)) ?? "null") as Registration | null); } catch { regs.set(name, null); }
    }
    return regs.get(name) ?? null;
  };
  const keyOf = (name: string): string => { const r = regOf(name); return r ? statKey(r.id, event, r.scopeArg) : ""; };
  const publish = (name: string, res: ResultFile): void => safe(() => writeAtomic(layout.res(dir, name), JSON.stringify(res)));

  /** Shortest expected first; unknown = 0 (runs first, then learned); arrival order on ties. */
  const next = (): string | undefined => {
    let best: string | undefined;
    let bestMs = Number.POSITIVE_INFINITY;
    let names: string[] = [];
    try { names = sortedRegNames(readdirSync(dir)); } catch { /* dir vanished: nothing pending */ }
    for (const name of names) {
      const ms = done.has(name) ? Number.POSITIVE_INFINITY : (stats[keyOf(name)] ?? 0);
      if (!done.has(name) && ms < bestMs) { best = name; bestMs = ms; }
    }
    return best;
  };

  const serve = async (name: string): Promise<void> => {
    done.add(name);
    const reg = regOf(name);
    const isOwn = name === ownName;
    const decline = !isOwn && (!reg || Date.now() - t0 > budgetMs || (stats[keyOf(name)] ?? 0) >= slowMs || envSignature(reg.env) !== sig);
    if (decline) return void publish(name, { kind: "decline" });
    if (!reg || !tryExclusive(layout.claim(dir, name), String(process.pid))) return; // stolen by its owner
    safe(() => appendFileSync(layout.order(dir), `${name}\n`));
    const started = Date.now();
    const result = await runRegistration(reg, ctx.text);
    observe(stats, keyOf(name), Date.now() - started);
    if (isOwn) own = result;
    else publish(name, { kind: "result", ...result });
  };

  /** Idle window before closing: 4x the mean arrival gap seen so far, within [quietMs, 150 ms] (a tight burst closes fast, a spread storm waits longer). */
  const quietNow = (): number => {
    const stamps = [...regs.keys()].map((n) => Number(n.split("-")[0])).filter(Number.isFinite).sort((a, b) => a - b);
    const mean = stamps.length > 1 ? ((stamps.at(-1) as number) - (stamps[0] as number)) / (stamps.length - 1) : 0;
    return Math.min(Math.max(quietMs, 150), Math.max(quietMs, 4 * mean));
  };
  let lastActivity = Date.now();
  for (;;) {
    const name = next();
    if (name) { await serve(name); lastActivity = Date.now(); continue; }
    if (Date.now() - lastActivity >= quietNow()) break;
    sleepSync(pollMs);
  }
  safe(() => void tryExclusive(layout.closed(dir))); // from now on a late registrant claims itself
  for (let name = next(); name; name = next()) await serve(name); // registered before the close
  saveStats(ctx.root, stats);
  sweep(ctx.root);
  return own ?? null;
}
