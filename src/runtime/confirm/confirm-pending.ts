import { homedir } from "node:os";
import { loadSessionState, saveSessionState, sanitizeSessionId } from "../home-state";

/** One `ask`-turned-deny awaiting the human's CONFIRM: full hash, short code, canonical command. */
export interface PendingDeny {
  hash: string;
  code: string;
  command: string;
  ts: number;
}

/** Max pending denies kept per session — the oldest is evicted beyond this (owner decision). A pending deny NEVER expires: only this eviction removes it. */
export const MAX_PENDING_DENIES = 10;

function isPendingEntry(v: unknown): v is PendingDeny {
  const o = v as PendingDeny;
  return typeof o === "object" && o !== null && typeof o.hash === "string" && typeof o.code === "string" && typeof o.ts === "number";
}

/**
 * Read the pending list (oldest first), merging the legacy single-slot
 * `pendingDeny` key (pre-multi format, possibly no `command` field) into it.
 */
function readPendings(state: Record<string, unknown>): PendingDeny[] {
  const list = Array.isArray(state.pendingDenies) ? state.pendingDenies.filter(isPendingEntry) : [];
  const legacyRaw = state.pendingDeny;
  const legacy = isPendingEntry(legacyRaw) ? [{ ...legacyRaw, command: typeof legacyRaw.command === "string" ? legacyRaw.command : "" }] : [];
  return [...list, ...legacy].sort((a, b) => a.ts - b.ts);
}

/** Persist the pending list in the multi format only (legacy key dropped); empty list removes the key. */
function writePendings(sid: string, state: Record<string, unknown>, pendings: readonly PendingDeny[], home: string): void {
  const { pendingDeny: _legacy, pendingDenies: _old, ...rest } = state;
  saveSessionState(sid, pendings.length > 0 ? { ...rest, pendingDenies: [...pendings] } : rest, home);
}

/**
 * Record the action a deny prompt just showed: APPENDED to this session's
 * pending list (same hash = refreshed, never duplicated), oldest evicted past
 * {@link MAX_PENDING_DENIES}. A new denial never erases the other pendings —
 * nor any armed token (those live in confirm-state.ts). Pure bookkeeping, no
 * gate: every ask-turned-deny records one, whether or not the user confirms.
 * @param sessionIdRaw - Raw session id from the payload.
 * @param hash - Full {@link import("./confirm-code").hashForAction} of the command.
 * @param code - The short display code shown alongside it.
 * @param command - The canonical command, named in the CONFIRM feedback.
 * @param now - Epoch ms.
 * @param home - Test-only OS home override.
 */
export function recordPendingDeny(sessionIdRaw: unknown, hash: string, code: string, command: string, now: number, home: string = homedir()): void {
  const sid = sanitizeSessionId(sessionIdRaw);
  if (!sid) return;
  const state = loadSessionState(sid, home);
  const pendings = [...readPendings(state).filter((p) => p.hash !== hash), { hash, code, command, ts: now } satisfies PendingDeny];
  writePendings(sid, state, pendings.slice(-MAX_PENDING_DENIES), home);
}

/** Read back the NEWEST pending deny for a session (`undefined` when none/invalid session id). */
export function getPendingDeny(sessionIdRaw: unknown, home: string = homedir()): PendingDeny | undefined {
  const sid = sanitizeSessionId(sessionIdRaw);
  if (!sid) return undefined;
  const pendings = readPendings(loadSessionState(sid, home));
  return pendings[pendings.length - 1];
}

/** The session's pending denies, newest first — for the CONFIRM feedback listing. Pendings never expire. */
export function listPendingDenies(sessionIdRaw: unknown, now: number, home: string = homedir()): readonly PendingDeny[] {
  const sid = sanitizeSessionId(sessionIdRaw);
  if (!sid) return [];
  return readPendings(loadSessionState(sid, home)).reverse();
}

/**
 * Find the pending deny whose code was typed: lookup code → full hash (the
 * hash alone later authorizes, never a code-to-code comparison — that would
 * reopen the collision {@link import("./confirm-code").displayCodeForAction}
 * warns about). Newest wins on a 4-hex collision. READ-ONLY: arming does NOT
 * consume the pending (it stays listed until the cap-10 eviction, exactly
 * like the legacy single slot stayed until the next denial), so an expired
 * token can be re-armed by retyping the same code. Returns `undefined` when
 * nothing matches.
 */
export function findPendingByCode(sessionIdRaw: unknown, code: string, now: number, home: string = homedir()): PendingDeny | undefined {
  const sid = sanitizeSessionId(sessionIdRaw);
  if (!sid) return undefined;
  const pendings = readPendings(loadSessionState(sid, home));
  const typed = code.toLowerCase();
  const matches = pendings.filter((p) => p.code.toLowerCase() === typed);
  return matches[matches.length - 1];
}
