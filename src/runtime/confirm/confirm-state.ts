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

/** Max armed tokens per session (mirrors the pending cap): oldest evicted beyond this. */
const MAX_CONFIRM_TOKENS = 10;

function isToken(v: unknown): v is ConfirmToken {
  const o = v as ConfirmToken;
  return typeof o === "object" && o !== null && typeof o.hash === "string" && typeof o.ts === "number";
}

/** Read the armed-token list, merging the legacy single-slot `confirmToken` key (pre-multi format). */
function readTokens(state: Record<string, unknown>): ConfirmToken[] {
  const list = Array.isArray(state.confirmTokens) ? state.confirmTokens.filter(isToken) : [];
  const legacy = isToken(state.confirmToken) ? [state.confirmToken] : [];
  return [...list, ...legacy].sort((a, b) => a.ts - b.ts);
}

/** Persist the token list in the multi format only (legacy key dropped); empty list removes the key. */
function writeTokens(sid: string, state: Record<string, unknown>, tokens: readonly ConfirmToken[], home: string): void {
  const { confirmToken: _legacy, confirmTokens: _old, ...rest } = state;
  saveSessionState(sid, tokens.length > 0 ? { ...rest, confirmTokens: [...tokens] } : rest, home);
}

/** Drop ONE token entry by identity (other armed tokens are never touched). */
function dropToken(sid: string, state: Record<string, unknown>, tokens: readonly ConfirmToken[], doomed: ConfirmToken, home: string): void {
  writeTokens(sid, state, tokens.filter((t) => t !== doomed), home);
}

/**
 * Pose a confirmation token for one of this session's pending actions —
 * append-or-refresh by hash, never dropping the OTHER armed tokens (a new
 * denial or confirmation no longer erases a code already given). No-op while
 * {@link isSubagentActive} (G0, confirm-subagent.ts) — the sole gate that
 * stops an agent, which always sees the display code in its own blocked tool
 * result, from typing it back to self-approve.
 */
export function placeConfirmToken(sessionIdRaw: unknown, hash: string, now: number, home: string = homedir(), env: Record<string, string | undefined> = process.env): void {
  const sid = sanitizeSessionId(sessionIdRaw);
  if (!sid || isSubagentActive(sid, now, home, env)) return;
  const state = loadSessionState(sid, home);
  const tokens = [...readTokens(state).filter((t) => t.hash !== hash), { hash, ts: now } satisfies ConfirmToken];
  writeTokens(sid, state, tokens.slice(-MAX_CONFIRM_TOKENS), home);
}

/**
 * Invalidate EVERY armed token of this session (G5: an explicit refusal,
 * widened to the list). NO-OP without any token — the state file is not
 * rewritten (pre-multi semantics: a refusal with nothing armed wrote nothing,
 * so a corrupt or concurrently-written file is never clobbered by `{}`).
 */
export function dropConfirmToken(sessionIdRaw: unknown, home: string = homedir()): void {
  const sid = sanitizeSessionId(sessionIdRaw);
  if (!sid) return;
  const state = loadSessionState(sid, home);
  if (readTokens(state).length === 0) return;
  writeTokens(sid, state, [], home);
}

/**
 * Consume the token that matches `hash` exactly (G3), whether or not it's
 * fresh — a mismatched hash leaves every token untouched (they may still be
 * valid for the actions they actually confirm). G1 (one-shot) + G2 (5-min TTL)
 * both apply only once the hash matches, and only THAT token is dropped.
 * @param grace - Cursor sibling-pass grace ({@link ConsumeGrace}); omitted = strict one-shot.
 * @returns true = allow (token consumed); false = deny (nothing changed, or
 * the matching token had expired / was already consumed and was dropped).
 */
export function consumeConfirmToken(sessionIdRaw: unknown, hash: string, now: number, home: string = homedir(), grace?: ConsumeGrace): boolean {
  const sid = sanitizeSessionId(sessionIdRaw);
  if (!sid) return false;
  const state = loadSessionState(sid, home);
  const tokens = readTokens(state);
  const tok = tokens.find((t) => t.hash === hash);
  if (!tok) return false;
  if (tok.consumedAt !== undefined) {
    // Already consumed: exactly ONE sibling pass of the same turn, within the grace, re-allows — then the token is gone.
    const sibling = !!grace && tok.consumedGen === grace.generationId && Math.abs(now - tok.consumedAt) <= grace.ms;
    dropToken(sid, state, tokens, tok, home);
    return sibling;
  }
  if (now - tok.ts > TTL_MS) {
    dropToken(sid, state, tokens, tok, home);
    return false;
  }
  if (!grace) {
    dropToken(sid, state, tokens, tok, home);
    return true;
  }
  writeTokens(sid, state, tokens.map((t) => (t === tok ? { ...tok, consumedAt: now, consumedGen: grace.generationId } satisfies ConfirmToken : t)), home);
  return true;
}
