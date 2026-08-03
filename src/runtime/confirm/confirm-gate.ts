import type { Prompt } from "../../prompt/types";
import { displayCodeForAction, hashForAction } from "./confirm-code";
import { isIrreversible } from "./confirm-irreversible";
import { recordPendingDeny } from "./confirm-pending";
import { consumeConfirmToken } from "./confirm-state";

/**
 * Harnesses where `respond.ts` silently downgrades `kind: "ask"` to a hard
 * deny (Codex: `case "codex"`; Kimi: `toKimiResponse` maps `ask` to the same
 * `permissionDecision:"deny"` envelope as `block`). Claude Code keeps native
 * interactive `ask` — this mechanism NEVER applies there.
 */
const DEGRADES_ASK_TO_DENY: ReadonlySet<string> = new Set(["codex", "kimi"]);

export type ConfirmVerdict = { allow: true } | { allow: false; prompt: Prompt };

/**
 * Whether/how a CONFIRM token changes an `ask` prompt about to be downgraded
 * to a deny. Returns `null` when this mechanism doesn't apply AT ALL — any
 * harness other than codex/kimi, any prompt kind other than `ask`, no
 * command to key a hash off, or an irreversible command (G4) — in which case
 * the caller's ORIGINAL prompt/response path runs completely unchanged. That
 * `null` fast-path, hit on every claude-code call and every non-`ask` prompt,
 * IS the non-regression property.
 * @param id - Harness target id.
 * @param prompt - The prompt `gate()` returned.
 * @param command - `event.command` for the tool-use under judgment.
 * @param sessionId - `event.sessionId`.
 * @param now - Epoch ms.
 * @param home - Test-only OS home override.
 */
export function confirmGate(id: string, prompt: Prompt, command: string | undefined, sessionId: string, now: number, home?: string): ConfirmVerdict | null {
  if (prompt.kind !== "ask" || !DEGRADES_ASK_TO_DENY.has(id) || !command || isIrreversible(command)) return null;
  try {
    const hash = hashForAction(command);
    if (consumeConfirmToken(sessionId, hash, now, home)) return { allow: true };
    const code = displayCodeForAction(command);
    recordPendingDeny(sessionId, hash, code, now, home);
    return { allow: false, prompt: { ...prompt, reason: `${prompt.reason}\nPour autoriser, réponds : CONFIRM ${code}` } };
  } catch {
    // A state-io failure (full disk, unwritable home) must fall back to the
    // plain deny, never crash the hook — same invariant as confirm-submit.ts.
    // The caller's `confirm ? confirm.prompt : prompt` treats `null` exactly
    // like "mechanism doesn't apply", i.e. the pre-CONFIRM deny unchanged.
    return null;
  }
}
