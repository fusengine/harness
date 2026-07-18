import { formatPrompt, type Prompt } from "../prompt/types";
import { denyResponse, contextResponse, informResponse } from "../adapters/claude";
import { toHermesResponse } from "../adapters/hermes";

/**
 * Map a portable {@link Prompt} to a harness's native hook response, honoring
 * all 3 prompt kinds (`block`/`ask`/`inform`) instead of collapsing `ask` and
 * `inform` together. Reuses the Claude adapter's `denyResponse`/
 * `contextResponse`/`informResponse` builders for claude-code/codex (same hook
 * shape) to avoid duplicating the JSON.
 * - claude-code/codex: `block` -> deny, `ask` -> interactive
 *   `permissionDecision:"ask"`, `inform` -> non-blocking `additionalContext`.
 * - gemini-cli/cline: their real hook schemas have no interactive "ask"
 *   state (deny is the only blocking outcome), so `ask` and `inform` already
 *   both resolve to non-blocking context injection — unchanged.
 * - cursor: `ask` keeps its current best-effort `permission:"ask"` shape;
 *   only `inform` is fixed to a non-blocking `permission:"allow"` note.
 * - hermes: delegated to the adapter's `toHermesResponse` — `block` ->
 *   `{decision:"block",reason}`; `ask`/`inform` degrade to non-blocking
 *   `{context}` (Hermes has no interactive "ask" state).
 *
 * User-visible pass notices (`prompt.userMessage`, Python `hook_output.allow_pass`
 * / `post_pass` parity), by harness:
 * - claude-code/codex: top-level `systemMessage` ("warning message shown to the
 *   user"); a pure notice (empty `reason`) emits `{systemMessage}` alone. Codex
 *   consumes the Claude hook schema, so it rides the same field.
 * - gemini-cli: common `systemMessage` output field ("displayed immediately to
 *   the user in the terminal") — the notice rides there.
 * - cursor: `user_message` is its user-visible channel (see case comment).
 * - cline: NO user-visible channel (`cancel`/`contextModification`/
 *   `errorMessage`-on-cancel only) — the notice is dropped silently (a pure
 *   notice returns "" = plain allow).
 * @param id - Harness id.
 * @param prompt - The portable prompt to render.
 * @param event - The firing hook event name for the claude-code/codex branch
 * (defaults to `"PreToolUse"`, the only phase every existing caller but
 * `handle-post.ts` renders) — a POST-phase caller MUST pass `"PostToolUse"`
 * (or its real raw event name) so `hookEventName` matches the event that
 * actually fired instead of a hardcoded, wrong `"PreToolUse"`.
 */
export function respond(id: string, prompt: Prompt, event: string = "PreToolUse"): string {
  const message = formatPrompt(prompt);
  const { kind, userMessage, reason } = prompt;
  switch (id) {
    case "claude-code":
    case "codex":
      if (kind === "block") return denyResponse(event, message);
      if (kind === "inform") {
        return userMessage ? informResponse(event, userMessage, reason ? message : "") : contextResponse(event, message);
      }
      // Codex parses but NEVER honors `permissionDecision: "ask"` (deny-only) — an
      // `ask` would silently fail open. Downgrade it to an explicit deny so the
      // gate still bites; the reason is prefixed so the honest limit is visible.
      if (id === "codex") {
        return denyResponse(event, `[downgraded from ask — Codex has no interactive approval]\n${message}`);
      }
      return JSON.stringify({
        hookSpecificOutput: {
          hookEventName: event,
          permissionDecision: "ask",
          permissionDecisionReason: message,
        },
      });
    case "gemini-cli":
      if (kind === "block") return JSON.stringify({ decision: "deny", reason: message });
      if (userMessage) return JSON.stringify({ ...(reason ? { hookSpecificOutput: { additionalContext: message } } : {}), systemMessage: userMessage });
      return JSON.stringify({ hookSpecificOutput: { additionalContext: message } });
    case "cursor":
      // snake_case required — camelCase silently ignored (#141516). The preToolUse
      // output schema documents user_message/agent_message on deny (+ask in the
      // official examples), NOT on allow — the allow-notice below is best-effort.
      if (kind === "inform") {
        if (userMessage) return JSON.stringify({ permission: "allow", user_message: userMessage, ...(reason ? { agent_message: message } : {}) });
        return JSON.stringify({ permission: "allow", user_message: message, agent_message: message });
      }
      return JSON.stringify({ permission: kind === "block" ? "deny" : "ask", continue: false, user_message: message, agent_message: message });
    case "hermes":
      // Single source of truth for the Hermes wire shape lives in the adapter
      // (same JSON.stringify contract as the inline cases above).
      return toHermesResponse(prompt);
    case "cline":
      if (kind === "block") return JSON.stringify({ cancel: true, errorMessage: message });
      if (userMessage && !reason) return ""; // pure notice: no user-visible channel — silent allow
      return JSON.stringify({ contextModification: message });
    default:
      return "";
  }
}
