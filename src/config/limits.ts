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
