import { createHash } from "node:crypto";

/**
 * Full SHA-256 hex digest (64 chars) of an action string (the exact command
 * a deny prompt showed). This is the ONLY value ever compared to authorize a
 * confirmation (G3, confirm-state.ts) — collision-resistant, unlike the
 * 4-char {@link displayCodeForAction} below.
 * @param action - The command/content string a deny prompt showed.
 */
export function hashForAction(action: string): string {
  return createHash("sha256").update(action).digest("hex");
}

/**
 * 4-hex-char PREFIX of {@link hashForAction}, for DISPLAY ONLY — never a
 * security boundary. It exists purely so a human has something short to
 * retype ("CONFIRM 4f2a"); at 16 bits it collides constantly across
 * unrelated actions (birthday bound ~a few hundred actions/session), and the
 * agent ALWAYS sees it too — `systemMessage` never reaches the user or model
 * under Codex (measured 2026-08-03: 0 occurrence in the rollout, nothing on
 * screen), so `permissionDecisionReason` is the only channel, and the model
 * reads its own code back in the very tool result that got blocked.
 *
 * What actually scopes a confirmation to ONE specific action is the full
 * hash recorded at deny time and re-checked at consume time (see
 * confirm-pending.ts / confirm-state.ts). What prevents an agent from typing
 * its own code back to self-approve is G0 (fail-closed while a sub-agent is
 * active) — never the code's secrecy, because it has none.
 * @param action - The command/content string to derive the display code from.
 */
export function displayCodeForAction(action: string): string {
  return hashForAction(action).slice(0, 4);
}
