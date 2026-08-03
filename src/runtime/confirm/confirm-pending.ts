import { homedir } from "node:os";
import { loadSessionState, saveSessionState, sanitizeSessionId } from "../home-state";

/** The last `ask`-turned-deny for a session: its full hash plus the short code shown to the human. */
export interface PendingDeny {
  hash: string;
  code: string;
  ts: number;
}

/**
 * Record the action a deny prompt just showed (overwrites any previous
 * pending deny for this session — only the LAST blocked action can be
 * confirmed). Pure bookkeeping, no gate: every ask-turned-deny records one,
 * whether or not the user ever confirms it.
 * @param sessionIdRaw - Raw session id from the payload.
 * @param hash - Full {@link import("./confirm-code").hashForAction} of the command.
 * @param code - The short display code shown alongside it.
 * @param now - Epoch ms.
 * @param home - Test-only OS home override.
 */
export function recordPendingDeny(sessionIdRaw: unknown, hash: string, code: string, now: number, home: string = homedir()): void {
  const sid = sanitizeSessionId(sessionIdRaw);
  if (!sid) return;
  const state = loadSessionState(sid, home);
  saveSessionState(sid, { ...state, pendingDeny: { hash, code, ts: now } satisfies PendingDeny }, home);
}

/** Read back the pending deny for a session (`undefined` when none/invalid session id). */
export function getPendingDeny(sessionIdRaw: unknown, home: string = homedir()): PendingDeny | undefined {
  const sid = sanitizeSessionId(sessionIdRaw);
  if (!sid) return undefined;
  return loadSessionState(sid, home).pendingDeny as PendingDeny | undefined;
}
