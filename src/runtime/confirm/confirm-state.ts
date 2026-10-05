import { homedir } from "node:os";
import { loadSessionState, saveSessionState, sanitizeSessionId } from "../home-state";
import { isSubagentActive } from "./confirm-subagent";

/** A posed confirmation token: the FULL action hash (G3) plus its mint timestamp (G2). */
interface ConfirmToken {
  hash: string;
  ts: number;
  /** Set (instead of dropping the token) when consumed under a {@link ConsumeGrace}. */
  consumedAt?: number;
  /** The `generationId` of that grace consumption. */
  consumedGen?: string;
}

/**
 * Cursor only (confirm-gate.ts): one Shell command reaches the harness TWICE —
 * `preToolUse` (tool Shell) then `beforeShellExecution` — and Cursor merges both
 * permissions, a deny winning. A grace consumption keeps the token, marked
 * consumed, so the sibling pass of the SAME command (same full hash) in the SAME
 * Cursor `generation_id` (the user turn) within `ms` is allowed too. Without a
 * grace (Kimi, every other caller) consumption stays strictly one-shot (G1).
 */
export interface ConsumeGrace {
  ms: number;
  generationId: string;
}

/** Confirmation freshness window (G2) — 5 minutes, matches the validated prototype. */
const TTL_MS = 5 * 60 * 1000;

/**
 * Pose a confirmation token for this session's pending action. No-op while
 * {@link isSubagentActive} (G0, confirm-subagent.ts) — the sole gate that
 * stops an agent, which always sees the display code in its own blocked tool
 * result, from typing it back to self-approve.
 */
export function placeConfirmToken(sessionIdRaw: unknown, hash: string, now: number, home: string = homedir(), env: Record<string, string | undefined> = process.env): void {
  const sid = sanitizeSessionId(sessionIdRaw);
  if (!sid || isSubagentActive(sid, now, home, env)) return;
  const state = loadSessionState(sid, home);
  saveSessionState(sid, { ...state, confirmToken: { hash, ts: now } satisfies ConfirmToken }, home);
}

/** Invalidate any pending token for this session (G5: an explicit refusal). */
export function dropConfirmToken(sessionIdRaw: unknown, home: string = homedir()): void {
  const sid = sanitizeSessionId(sessionIdRaw);
  if (!sid) return;
  const state = loadSessionState(sid, home);
  if (state.confirmToken === undefined) return;
  const { confirmToken: _drop, ...rest } = state;
  saveSessionState(sid, rest, home);
}

/**
 * Consume a token that matches `hash` exactly (G3), whether or not it's
 * fresh — a mismatched hash leaves the token untouched (it may still be
 * valid for the action it actually confirms). G1 (one-shot) + G2 (5-min TTL)
 * both apply only once the hash matches.
 * @param grace - Cursor sibling-pass grace ({@link ConsumeGrace}); omitted = strict one-shot.
 * @returns true = allow (token consumed); false = deny (nothing changed, or
 * the matching token had expired / was already consumed and was dropped).
 */
export function consumeConfirmToken(sessionIdRaw: unknown, hash: string, now: number, home: string = homedir(), grace?: ConsumeGrace): boolean {
  const sid = sanitizeSessionId(sessionIdRaw);
  if (!sid) return false;
  const state = loadSessionState(sid, home);
  const tok = state.confirmToken as ConfirmToken | undefined;
  if (!tok || tok.hash !== hash) return false;
  if (tok.consumedAt !== undefined) {
    // Already consumed: exactly ONE sibling pass of the same turn, within the grace, re-allows — then the token is gone.
    const sibling = !!grace && tok.consumedGen === grace.generationId && Math.abs(now - tok.consumedAt) <= grace.ms;
    dropConfirmToken(sid, home);
    return sibling;
  }
  if (now - tok.ts > TTL_MS) {
    dropConfirmToken(sid, home);
    return false;
  }
  if (!grace) {
    dropConfirmToken(sid, home);
    return true;
  }
  saveSessionState(sid, { ...state, confirmToken: { ...tok, consumedAt: now, consumedGen: grace.generationId } satisfies ConfirmToken }, home);
  return true;
}
