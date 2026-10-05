/**
 * Rendezvous tuning + kill switch. Light: only `parseEnvInt` is imported so a
 * follower reads this before any heavy module is loaded.
 *
 * Why these defaults (measured, see test/multi-rendezvous-cost.test.ts):
 *  - quiet floor 20 ms (the leader widens it to 4x the mean arrival gap, cap 150 ms):
 *    sibling hook processes of one host event start within a few ms of each other
 *    on an idle machine (30 siblings: wall +7 ms vs today, all served; a 100 ms
 *    window cost +90 ms); under load the arrivals spread and the window follows.
 *  - budget 2000 ms: the leader stops claiming further registrations after this,
 *    so it never outlives the tightest declared host handler timeout (3 s).
 *  - steal 1200 ms: a follower whose scope the leader has not CLAIMED by then
 *    runs it itself (today's standalone path) — worst-case added latency.
 */
import { parseEnvInt } from "../../config/env";
import type { RdvTuning } from "./types";

/** Env var opting IN to the mechanism (`1`, `true`, `on`, `yes`); default OFF = today's legacy path. */
export const RDV_KILL_SWITCH = "FUSE_HARNESS_RENDEZVOUS";

/** True only when explicitly opted in: zero-regression default until every side effect is proven identical. */
export function rdvEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env[RDV_KILL_SWITCH]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/**
 * Resolve the tuning from env (`FUSE_HARNESS_RDV_*_MS`), falling back to defaults.
 * @param env - Environment (defaults to `process.env`).
 */
export function resolveTuning(env: Record<string, string | undefined> = process.env): RdvTuning {
  return {
    quietMs: parseEnvInt(env.FUSE_HARNESS_RDV_QUIET_MS, 20),
    stealMs: parseEnvInt(env.FUSE_HARNESS_RDV_STEAL_MS, 1200),
    budgetMs: parseEnvInt(env.FUSE_HARNESS_RDV_BUDGET_MS, 2000),
    staleMs: parseEnvInt(env.FUSE_HARNESS_RDV_STALE_MS, 10_000),
    hardMs: parseEnvInt(env.FUSE_HARNESS_RDV_HARD_MS, 30_000),
    pollMs: parseEnvInt(env.FUSE_HARNESS_RDV_POLL_MS, 4),
    maxTextBytes: parseEnvInt(env.FUSE_HARNESS_RDV_MAX_BYTES, 1024 * 1024),
    slowMs: parseEnvInt(env.FUSE_HARNESS_RDV_SLOW_MS, 1000),
  };
}
