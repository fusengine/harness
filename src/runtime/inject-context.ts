import { contextResponse } from "../adapters/claude";
import { buildClaudeMdContext } from "../policy/claude-md-context";
import { buildApexTaskInjection } from "../policy/apex-task-context";

/**
 * UserPromptSubmit context injection: render the CLAUDE.md (+ optional APEX)
 * preamble as a Claude `additionalContext` response, or "" when nothing to emit.
 * @param prompt - The raw user prompt.
 * @param cwd - Project root (for project-type detection).
 * @returns The native hook stdout (possibly empty).
 */
export function promptSubmitContext(prompt: string, cwd: string): string {
  const ctx = buildClaudeMdContext(prompt, cwd);
  return ctx ? contextResponse("UserPromptSubmit", ctx) : "";
}

/**
 * PreToolUse Task context injection: render the APEX sub-agent context as a
 * Claude `additionalContext` response when `.claude/apex/` exists, else "".
 * @param cwd - Fallback project root when `CLAUDE_PROJECT_DIR` is unset.
 * @returns The native hook stdout (possibly empty).
 */
export function taskContext(cwd: string): string {
  const ctx = buildApexTaskInjection(process.env.CLAUDE_PROJECT_DIR ?? cwd);
  return ctx ? contextResponse("PreToolUse", ctx) : "";
}
