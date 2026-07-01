import { parseEnvInt } from "./env";

/**
 * Default enforcement-freshness window, in seconds (2 minutes). Matches the
 * plugin's original `FUSE_ENFORCE_TTL_SEC` default. This is the constant that
 * actually reaches production (via `resolveTtlSec` -> `bin.ts`); `gate.ts`'s
 * `DEFAULT_WINDOW_MS` is only a fallback for direct programmatic callers that
 * omit `windowMs` (e.g. tests) and never applies on the real CLI path.
 */
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
