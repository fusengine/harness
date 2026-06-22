import { formatPrompt, type Prompt } from "../prompt/types";

/**
 * Map a portable {@link Prompt} to a harness's native hook response. `block`
 * denies; anything else asks/injects context. (Codex/Cursor parse but ignore
 * `ask` — they only honor deny.)
 */
export function respond(id: string, prompt: Prompt): string {
  const message = formatPrompt(prompt);
  const deny = prompt.kind === "block";
  switch (id) {
    case "claude-code":
    case "codex":
      return JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: deny ? "deny" : "ask",
          permissionDecisionReason: message,
        },
      });
    case "gemini-cli":
      return JSON.stringify(deny ? { decision: "deny", reason: message } : { hookSpecificOutput: { additionalContext: message } });
    case "cursor":
      return JSON.stringify({ permission: deny ? "deny" : "ask", continue: false, userMessage: message, agentMessage: message });
    case "cline":
      return JSON.stringify(deny ? { cancel: true, errorMessage: message } : { contextModification: message });
    default:
      return "";
  }
}
