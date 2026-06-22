/**
 * Gemini CLI adapter (hook-mode). Schema per google-gemini/gemini-cli docs/hooks (2026):
 * `BeforeTool` blocks via `{ decision: "deny", reason }` (or exit 2).
 */
import { evaluate } from "../../policy/evaluate";
import { formatPrompt } from "../../prompt/types";

/** `BeforeTool` stdin payload (subset). */
export interface GeminiHookInput {
  tool_name?: string;
  tool_input?: { command?: string; path?: string; content?: string };
  hook_event_name?: string;
}

/** Hook stdout response. */
export interface GeminiResponse {
  decision?: "allow" | "deny";
  reason?: string;
  hookSpecificOutput?: { additionalContext?: string };
}

/** Evaluate a tool use; deny on a hard block, otherwise inject context. */
export function beforeTool(input: GeminiHookInput): GeminiResponse {
  const i = input.tool_input;
  const r = evaluate({
    tool: input.tool_name ?? "write_file",
    filePath: i?.path,
    content: i?.content,
    command: i?.command,
  });
  if (r.decision === "allow" || !r.prompt) return {};
  const msg = formatPrompt(r.prompt);
  return r.prompt.kind === "block"
    ? { decision: "deny", reason: msg }
    : { hookSpecificOutput: { additionalContext: msg } };
}
