import { getPendingDeny } from "./confirm-pending";
import { dropConfirmToken, placeConfirmToken } from "./confirm-state";

/** Common explicit-refusal words (fr/en), any of which invalidates a pending token (G5). */
const REFUSAL_RE = /\b(non|no|stop|annule|cancel|abort|nope|laisse tomber|pas maintenant)\b/i;
/** `CONFIRM <4-hex-chars>`, case-insensitive, tolerant of `confirm4f2a` / `Confirm-4f2a` / `confirm_4f2a`. */
const CONFIRM_RE = /confirm[\s_-]*([0-9a-f]{4})\b/i;

/**
 * Parse a submitted user prompt for `CONFIRM <code>` or an explicit refusal.
 * A refusal always wins (checked first) and drops any pending token (G5),
 * even if the same text also happens to contain a code. A confirm only
 * places a token when its 4-char code matches this session's LAST pending
 * deny (see confirm-pending.ts) — the code is looked up back to the full
 * hash that deny recorded, never compared as a code-to-code match (that
 * would reopen the collision {@link import("./confirm-code").displayCodeForAction}
 * warns about). Never throws — this runs inside a hook.
 * @param sessionId - The normalized event's session id.
 * @param text - The prompt text ({@link import("../prompt-text").promptText} output).
 * @param now - Epoch ms.
 * @param home - Test-only OS home override.
 */
export function handleConfirmSubmit(sessionId: string, text: string, now: number, home?: string): void {
  try {
    if (REFUSAL_RE.test(text)) {
      dropConfirmToken(sessionId, home);
      return;
    }
    const m = text.match(CONFIRM_RE);
    const typedCode = m?.[1];
    if (!typedCode) return;
    const pending = getPendingDeny(sessionId, home);
    if (!pending || pending.code.toLowerCase() !== typedCode.toLowerCase()) return;
    placeConfirmToken(sessionId, pending.hash, now, home); // G0 enforced inside
  } catch {
    // A state-io failure must never break the hook.
  }
}
