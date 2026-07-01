import { formatPrompt, type Prompt } from "../prompt/types";
import { denyResponse, contextResponse } from "../adapters/claude";

/**
 * Map a portable {@link Prompt} to a harness's native hook response, honoring
 * all 3 prompt kinds (`block`/`ask`/`inform`) instead of collapsing `ask` and
 * `inform` together. Reuses the Claude adapter's `denyResponse`/
 * `contextResponse` builders for claude-code/codex (same hook shape) to avoid
 * duplicating the JSON.
 * - claude-code/codex: `block` -> deny, `ask` -> interactive
 *   `permissionDecision:"ask"`, `inform` -> non-blocking `additionalContext`.
 * - gemini-cli/cline: their real hook schemas have no interactive "ask"
 *   state (deny is the only blocking outcome), so `ask` and `inform` already
 *   both resolve to non-blocking context injection — unchanged.
 * - cursor: `ask` keeps its current best-effort `permission:"ask"` shape
 *   (unverified against Cursor's exact hook docs); only `inform` is fixed to
 *   a non-blocking `permission:"allow"` note, since it was wrongly conflated
 *   with `ask` before.
 */
export function respond(id: string, prompt: Prompt): string {
  const message = formatPrompt(prompt);
  const { kind } = prompt;
  switch (id) {
    case "claude-code":
    case "codex":
      if (kind === "block") return denyResponse("PreToolUse", message);
      if (kind === "inform") return contextResponse("PreToolUse", message);
      return JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: message,
        },
      });
    case "gemini-cli":
      return JSON.stringify(kind === "block" ? { decision: "deny", reason: message } : { hookSpecificOutput: { additionalContext: message } });
    case "cursor":
      if (kind === "inform") return JSON.stringify({ permission: "allow", userMessage: message, agentMessage: message });
      return JSON.stringify({ permission: kind === "block" ? "deny" : "ask", continue: false, userMessage: message, agentMessage: message });
    case "cline":
      return JSON.stringify(kind === "block" ? { cancel: true, errorMessage: message } : { contextModification: message });
    default:
      return "";
  }
}
