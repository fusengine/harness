import { parseEnvInt } from "./env";

/** Default SOLID max lines per file. */
export const DEFAULT_MAX_LINES = 100;

/** Default env var name carrying the max-lines override. */
export const MAX_LINES_ENV_KEY = "FUSE_SOLID_MAX_LINES";

/**
 * Resolve the SOLID max-lines limit from an env map.
 * @param env - environment map (defaults to `process.env`)
 * @param key - env var name (defaults to `FUSE_SOLID_MAX_LINES`)
 */
export function resolveMaxLines(
  env: Record<string, string | undefined> = process.env,
  key: string = MAX_LINES_ENV_KEY,
): number {
  return parseEnvInt(env[key], DEFAULT_MAX_LINES);
}

/** Advisory module-split headroom = `maxLines - 10` (never below 1). */
export function splitTarget(maxLines: number): number {
  return Math.max(maxLines - 10, 1);
}

/**
 * Custom-hook line budget, derived from the global limit (ratio 0.3 — with
 * the default 100 this yields the owner template's 30; one variable,
 * `FUSE_SOLID_MAX_LINES`, drives every budget proportionally).
 * @param maxLines - The global limit (from {@link resolveMaxLines}).
 */
export function hookBudget(maxLines: number): number {
  return Math.max(Math.round(maxLines * 0.3), 1);
}

/**
 * Store line budget, derived from the global limit (ratio 0.4 — 40 at the
 * default 100, per owner rules/07-state-management).
 * @param maxLines - The global limit (from {@link resolveMaxLines}).
 */
export function storeBudget(maxLines: number): number {
  return Math.max(Math.round(maxLines * 0.4), 1);
}

/** Default stdin cap for hook payloads: 16 MiB. */
export const DEFAULT_STDIN_MAX_BYTES: number = 16 * 1024 * 1024;

/**
 * Resolve the hook stdin cap (`FUSE_HOOK_STDIN_MAX_BYTES`, default 16 MiB;
 * absent/invalid falls back to the default). The only new env var of the
 * mission — owner-approved exception.
 * @param env - environment map (defaults to `process.env`)
 */
export function resolveStdinMaxBytes(env: Record<string, string | undefined> = process.env): number {
  return parseEnvInt(env.FUSE_HOOK_STDIN_MAX_BYTES, DEFAULT_STDIN_MAX_BYTES);
}

/**
 * Default total wait (ms) for the blocking journal-append lock. Measured:
 * a compaction of the default 128 KiB log holds `track.lock` ~3 ms, 1 MiB
 * ~55 ms, 3.5 MiB ~470 ms; 1000 ms covers a compaction of ~5 MiB (40x the
 * cap) while keeping a hook process lifetime short. Past it the event is
 * spilled (never lost), see `track-spill.ts`.
 */
export const DEFAULT_TRACK_LOCK_BUDGET_MS: number = 1000;
/** Lower clamp: below this the lock cannot be won under normal contention. */
const MIN_TRACK_LOCK_BUDGET_MS = 50;
/** Upper clamp: stays under the 10 s stale-lock TTL so reclamation can still win. */
const MAX_TRACK_LOCK_BUDGET_MS = 8000;

/**
 * Resolve the blocking-append lock budget (`FUSE_TRACK_LOCK_BUDGET_MS`,
 * default 1000 ms; absent/invalid falls back, valid values are clamped to
 * [50, 8000] so the wait is always finite).
 * @param env - environment map (defaults to `process.env`)
 */
export function resolveTrackLockBudgetMs(env: Record<string, string | undefined> = process.env): number {
  const n = parseEnvInt(env.FUSE_TRACK_LOCK_BUDGET_MS, DEFAULT_TRACK_LOCK_BUDGET_MS);
  return Math.min(Math.max(n, MIN_TRACK_LOCK_BUDGET_MS), MAX_TRACK_LOCK_BUDGET_MS);
}
