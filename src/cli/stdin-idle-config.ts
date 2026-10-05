import { parseEnvInt } from "../config/env";

const DEFAULT_GRACE_MS = 100;
/** The hosts' default hook timeout: a slow host may legitimately take that long to write the payload. */
const DEFAULT_PARTIAL_MS = 600_000;

const MIN_GRACE_MS = 10;
const MAX_GRACE_MS = 5_000;
const MIN_PARTIAL_MS = 50;
const MAX_PARTIAL_MS = 3_600_000;

const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

/**
 * Resolve the settle grace (`FUSE_HOOK_STDIN_GRACE_MS`, default 100 ms,
 * clamped to [10, 5000]). After a complete top-level JSON object the reader
 * still drains bytes that are already queued (so trailing garbage or a second
 * object fails exactly as at EOF) and stops once nothing arrives for this long.
 * @param env - environment map (defaults to `process.env`)
 */
export function resolveStdinGraceMs(env: Record<string, string | undefined> = process.env): number {
  return clamp(parseEnvInt(env.FUSE_HOOK_STDIN_GRACE_MS, DEFAULT_GRACE_MS), MIN_GRACE_MS, MAX_GRACE_MS);
}

/**
 * Resolve the stdin wait bound (`FUSE_HOOK_STDIN_PARTIAL_MS`, default 600000 =
 * the hosts' default hook timeout, clamped to [50, 3600000]). While stdin stays
 * open and no complete JSON object has arrived (zero bytes or half a payload) the
 * reader keeps waiting this long, exactly like a blocking read would; past it the
 * hook fails closed. There is no shorter give-up window: quitting early on a late
 * first byte would turn a deny-worthy payload into an allow.
 * @param env - environment map (defaults to `process.env`)
 */
export function resolveStdinPartialMs(env: Record<string, string | undefined> = process.env): number {
  return clamp(parseEnvInt(env.FUSE_HOOK_STDIN_PARTIAL_MS, DEFAULT_PARTIAL_MS), MIN_PARTIAL_MS, MAX_PARTIAL_MS);
}
