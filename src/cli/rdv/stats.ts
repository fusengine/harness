/**
 * Per-scope duration memory of the rendezvous (`<root>/stats.json`). The leader
 * serves the SHORTEST expected scope first and hands a scope that is expected
 * to be slow back to its own process (`decline`), so one slow scope (a hook
 * that sleeps for seconds) never queues the quick ones behind it. Purely a
 * scheduling hint: a missing/corrupt file just means "unknown = run first".
 */
import { join } from "node:path";
import { readText, writeAtomic } from "./fs";

/** key (`<host>:<event>:<scope>`) -> exponential moving average of the unit's wall time (ms). */
export type Stats = Record<string, number>;

/** Weight of the newest observation. */
const ALPHA = 0.5;

/** Stats key for a registration of an event. */
export function statKey(id: string, event: string, scopeArg: string | undefined): string {
  return `${id}:${event}:${scopeArg ?? "core"}`;
}

/** `hook_event_name` of the shared payload ("" when absent or not JSON). */
export function eventNameOf(text: string): string {
  try {
    const v = (JSON.parse(text) as Record<string, unknown> | null)?.hook_event_name;
    return typeof v === "string" ? v : "";
  } catch { return ""; }
}

/** Load the stats ({} when missing/corrupt). */
export function loadStats(root: string): Stats {
  try {
    const raw: unknown = JSON.parse(readText(join(root, "stats.json")) ?? "{}");
    return typeof raw === "object" && raw !== null ? (raw as Stats) : {};
  } catch { return {}; }
}

/** Persist the stats (best effort: a lost update only loses a hint). */
export function saveStats(root: string, stats: Stats): void {
  try { writeAtomic(join(root, "stats.json"), JSON.stringify(stats)); } catch { /* hint only */ }
}

/** Fold one observation into the moving average. */
export function observe(stats: Stats, key: string, ms: number): void {
  const old = stats[key];
  stats[key] = Math.round(old === undefined ? ms : ALPHA * ms + (1 - ALPHA) * old);
}
