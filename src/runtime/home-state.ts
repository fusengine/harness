import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { atomicWrite } from "../util/json-io";

/** Home `~/.claude` dir — per-harness config (CLAUDE.md, logs, plugins). */
export function claudeHome(home: string = homedir()): string {
  return join(home, ".claude");
}

/** Neutral, harness-agnostic home for fuse-harness's OWN cache/state: `~/.fuse-harness`. */
export function fuseHarnessHome(home: string = homedir()): string {
  return join(home, ".fuse-harness");
}

/** `~/.fuse-harness/cache` base dir for session/cache state (shared across harnesses). */
export function fusengineCache(home: string = homedir()): string {
  return join(fuseHarnessHome(home), "cache");
}

/** `~/.fuse-harness/cache/sessions` — per-session JSON state dir. */
export function sessionsDir(home: string = homedir()): string {
  return join(fusengineCache(home), "sessions");
}

const SID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

/** Validate a session id (1-128 url-safe chars); null when invalid. */
export function sanitizeSessionId(sid: unknown): string | null {
  const s = String(sid ?? "").trim();
  return SID_RE.test(s) ? s : null;
}

/** Unified per-session state file path: `sessions/session-<sid>.json`. */
export function sessionStatePath(sid: string, home: string = homedir()): string {
  return join(sessionsDir(home), `session-${sid}.json`);
}

/** Load a session-state dict, or `{}` when missing/corrupt (mirrors Python). */
export function loadSessionState(sid: string, home: string = homedir()): Record<string, unknown> {
  const path = sessionStatePath(sid, home);
  try {
    if (!existsSync(path)) return {};
    const data: unknown = JSON.parse(readFileSync(path, "utf-8"));
    return typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Atomically persist a session-state dict (0o600 via atomicWrite, indent 2). */
export function saveSessionState(sid: string, state: Record<string, unknown>, home: string = homedir()): void {
  mkdirSync(sessionsDir(home), { recursive: true, mode: 0o700 });
  atomicWrite(sessionStatePath(sid, home), JSON.stringify(state, null, 2));
}
