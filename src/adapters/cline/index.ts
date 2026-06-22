/**
 * Cline adapter (hook-mode). Schema per docs.cline.bot / .clinerules/hooks (2026):
 * `PreToolUse` blocks via `{ cancel: true }`; it cannot modify tool parameters.
 */
import { evaluate } from "../../policy/evaluate";
import { formatPrompt } from "../../prompt/types";

/** `PreToolUse` stdin payload (subset). */
export interface ClineHookInput {
  hookName?: string;
  preToolUse?: {
    toolName?: string;
    parameters?: { path?: string; content?: string; command?: string };
  };
}

/** Hook stdout response. */
export interface ClineResponse {
  cancel?: boolean;
  errorMessage?: string;
  contextModification?: string;
}

/** Evaluate a tool use; cancel on a hard block, otherwise inject context. */
export function preToolUse(input: ClineHookInput): ClineResponse {
  const t = input.preToolUse;
  const r = evaluate({
    tool: t?.toolName ?? "write_to_file",
    filePath: t?.parameters?.path,
    content: t?.parameters?.content,
    command: t?.parameters?.command,
  });
  if (r.decision === "allow" || !r.prompt) return {};
  const msg = formatPrompt(r.prompt);
  return r.prompt.kind === "block" ? { cancel: true, errorMessage: msg } : { contextModification: msg };
}
