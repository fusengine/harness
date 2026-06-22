import { parseEnvInt } from "./env";

/** Default enforcement-freshness window, in seconds (2 minutes). */
export const DEFAULT_TTL_SEC = 120;

/** Default env var name carrying the TTL override. */
export const TTL_ENV_KEY = "FUSE_ENFORCE_TTL_SEC";

/**
 * Resolve the enforcement TTL (seconds) from an env map.
 * @param env - environment map (defaults to `process.env`)
 * @param key - env var name (defaults to `FUSE_ENFORCE_TTL_SEC`)
 */
export function resolveTtlSec(
  env: Record<string, string | undefined> = process.env,
  key: string = TTL_ENV_KEY,
): number {
  return parseEnvInt(env[key], DEFAULT_TTL_SEC);
}

/** Human label for a TTL: 120 -> "2min", 240 -> "4min", 90 -> "90s". */
export function ttlLabel(sec: number): string {
  return sec % 60 === 0 ? `${sec / 60}min` : `${sec}s`;
}
