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
