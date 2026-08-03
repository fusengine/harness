import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fuseHarnessHome, sanitizeSessionId } from "./home-state";

/** `~/.fuse-harness/design-sessions/<sid>` — session-anchored design-state dir. */
function sessionCacheDir(sid: string, home?: string): string {
  return join(fuseHarnessHome(home), "design-sessions", sid);
}

/** True when `dir` already holds the design-agent flag or a `.design-state-*.json` snapshot. */
function hasDesignState(dir: string): boolean {
  if (existsSync(join(dir, "design-agent-active"))) return true;
  try {
    return readdirSync(dir).some((name) => name.startsWith(".design-state-"));
  } catch {
    return false;
  }
}

/**
 * Resolve the cache dir the design pipeline (active-agent flag +
 * `.design-state-<agentId>.json`) should read AND write for this hook call.
 *
 * Anchored on the session id, not the invoking process's `cwd`: a design
 * agent's `SubagentStart` and its later tool writes can run with different
 * `process.cwd()` values, and a cwd-keyed cache dir then silently misses the
 * flag/state — every design gate fails open (see MEMORY/LESSON.md).
 *
 * Contract (non-regression): `resolved = sessionDirIfPopulated ??
 * cwdDirIfPopulated ?? sessionDirDefault`. Before this fix the session-keyed
 * dir never existed, so for every session whose state already lives under
 * `cwdCacheDir` the FIRST branch is always empty and resolution falls through
 * to `cwdCacheDir` — byte-identical to the pre-fix value. Only a session with
 * NO state anywhere (today's silent-fail-open case, e.g. cwd drifted between
 * `SubagentStart` and the write) diverges, anchoring on the session dir
 * instead of silently missing the flag. Read and write always resolve through
 * this same function against the same two inputs, so they can never target
 * different locations mid-session.
 * @param sessionId - The hook event's session id (`NormalizedEvent.sessionId`).
 * @param cwdCacheDir - The legacy, cwd-derived cache dir (`projectLayout(cwd).cacheDir`).
 * @param home - OS home override (tests only).
 * @returns The cache dir to pass to the design flag/state/gate functions.
 */
export function resolveDesignCacheDir(sessionId: string, cwdCacheDir: string, home?: string): string {
  const sid = sanitizeSessionId(sessionId);
  if (!sid) return cwdCacheDir; // no stable session id -> unchanged legacy behavior
  const sessDir = sessionCacheDir(sid, home);
  if (hasDesignState(sessDir)) return sessDir;
  if (hasDesignState(cwdCacheDir)) return cwdCacheDir;
  return sessDir;
}
