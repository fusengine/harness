/**
 * Claude Code adapter — the thin Claude-only shim over the portable policy core.
 * Reads the hook stdin payload and emits hookSpecificOutput responses.
 */
import { evaluate } from "../../policy/evaluate";
import { formatPrompt, type Prompt } from "../../prompt/types";
import { readStdin } from "../../util/runtime-io";

/** Subset of the Claude Code hook stdin payload we consume. */
export interface ClaudeHookInput {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; content?: string; new_string?: string; command?: string };
  cwd?: string;
}

/** Read & parse the Claude hook payload from stdin (empty object on bad input). */
export async function readClaudeInput(): Promise<ClaudeHookInput> {
  const text = await readStdin();
  if (!text.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as ClaudeHookInput) : {};
  } catch {
    return {};
  }
}

/** A `deny` hook response for a given event. */
export function denyResponse(event: string, reason: string): string {
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: event, permissionDecision: "deny", permissionDecisionReason: reason },
  });
}

/** An `additionalContext` injection response. */
export function contextResponse(event: string, text: string): string {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } });
}

/**
 * Render a portable {@link Prompt} as a Claude Code hook response:
 * `block` → `permissionDecision: deny`, `ask` → `permissionDecision: ask`
 * (interactive confirm), `inform` → `additionalContext`.
 */
export function toClaudeResponse(event: string, prompt: Prompt): string {
  const reason = formatPrompt(prompt);
  if (prompt.kind === "block") return denyResponse(event, reason);
  if (prompt.kind === "ask") {
    return JSON.stringify({
      hookSpecificOutput: { hookEventName: event, permissionDecision: "ask", permissionDecisionReason: reason },
    });
  }
  return contextResponse(event, reason);
}

/**
 * Run the bundled policy over a Claude payload and return the native response
 * string (deny/ask/additionalContext), or null to allow.
 */
export function guard(input: ClaudeHookInput): string | null {
  const result = evaluate({
    tool: input.tool_name ?? "Write",
    filePath: input.tool_input?.file_path,
    content: input.tool_input?.content ?? input.tool_input?.new_string,
    command: input.tool_input?.command,
  });
  if (result.decision === "allow" || !result.prompt) return null;
  return toClaudeResponse(input.hook_event_name ?? "PreToolUse", result.prompt);
}

/** @deprecated use {@link guard}. Kept for back-compat. */
export const fileSizeGuard: typeof guard = guard;
