import { findPendingByCode } from "./confirm-pending";
import { dropConfirmToken, placeConfirmToken } from "./confirm-state";
import { isSubagentActive } from "./confirm-subagent";
import type { ConfirmSubmitOutcome } from "./confirm-outcome";

/** Common explicit-refusal words (fr/en), any of which invalidates a pending token (G5). */
export const REFUSAL_RE: RegExp = /\b(non|no|stop|annule|cancel|abort|nope|laisse tomber|pas maintenant)\b/i;
/** `CONFIRM <4-hex-chars>`, case-insensitive, tolerant of `confirm4f2a` / `Confirm-4f2a` / `confirm_4f2a`. */
const CONFIRM_RE = /confirm[\s_-]*([0-9a-f]{4})\b/i;
/** Anchored form (same as codex): the WHOLE trimmed prompt is exactly `CONFIRM xxxx`. */
const CONFIRM_ANCHORED_RE = /^confirm[ _-]*([0-9a-f]{4})$/i;

/**
 * Parse a submitted user prompt for `CONFIRM <code>` or an explicit refusal.
 * A refusal always wins (checked first) and drops the session's ARMED TOKENS
 * (G5) — the pending denies SURVIVE (pre-multi semantics: an old slot stayed
 * valid until the next denial; with the list, until the cap-10 eviction),
 * even if the same text also happens to contain a code. A confirm arms ONLY
 * the action whose code matches one of this session's pending denies (see
 * confirm-pending.ts) — the code is looked up back to the full hash that deny
 * recorded, never compared as a code-to-code authorization, and arming does
 * NOT consume the pending (an expired token can be re-armed by retyping the
 * same code). While a sub-agent is active (G0) the code is ignored.
 *
 * Feedback (confirm-feedback.ts) is emitted ONLY when the whole trimmed
 * prompt is exactly `CONFIRM xxxx` ({@link CONFIRM_ANCHORED_RE}) — an
 * incidental match ("please confirm 2024 figures") arms silently, exactly as
 * before, with byte-identical output. Never throws — runs inside a hook.
 * Returns `null` when nothing user-visible happened.
 * @param sessionId - The normalized event's session id.
 * @param text - The prompt text ({@link import("../prompt-text").promptText} output).
 * @param now - Epoch ms.
 * @param home - Test-only OS home override.
 */
export function handleConfirmSubmit(sessionId: string, text: string, now: number, home?: string): ConfirmSubmitOutcome | null {
  try {
    if (REFUSAL_RE.test(text)) {
      dropConfirmToken(sessionId, home);
      return { kind: "refused" };
    }
    const m = text.match(CONFIRM_RE);
    const typedCode = m?.[1];
    if (!typedCode) return null;
    const ack = CONFIRM_ANCHORED_RE.test(text.trim());
    if (isSubagentActive(sessionId, now, home)) return ack ? { kind: "frozen", code: typedCode } : null;
    const pending = findPendingByCode(sessionId, typedCode, now, home);
    if (!pending) return ack ? { kind: "unknown-code", code: typedCode } : null;
    placeConfirmToken(sessionId, pending.hash, now, home); // G0 re-enforced inside
    return ack ? { kind: "armed", code: pending.code, command: pending.command } : null;
  } catch {
    // A state-io failure must never break the hook.
    return null;
  }
}
