import { attachSystemMessage, contextResponse } from "../adapters/claude";
import { buildClaudeMdContext } from "../policy/claude-md-context";
import { buildApexTaskInjection } from "../policy/apex-task-context";
import { apexDocName } from "../policy/apex-target";
import { hashText } from "../util/json-io";
import { oncePerWindow, DEDUP_WINDOW_MS } from "./inject-dedup";
import { capFragment } from "./inject-budget";

/**
 * Build the {@link oncePerWindow} key for the CLAUDE.md preamble gate. The
 * prompt hash keeps two distinct legitimate turns from colliding — even non-dev
 * prompts, whose block is prompt-independent (just CLAUDE.md) and would
 * otherwise hash-collide within the window — while the content hash still lets a
 * same-turn double-fire of an identical block be suppressed. Single source of
 * truth so the owner invariant test guards the real production key.
 * @param prompt - The raw user prompt.
 * @param ctx - The rendered CLAUDE.md (+ optional APEX) block.
 * @returns The namespaced dedup key.
 */
export function claudeMdKey(prompt: string, ctx: string): string {
  return `claude-md:${hashText(prompt)}:${hashText(ctx)}`;
}

/**
 * UserPromptSubmit context injection: render the CLAUDE.md (+ optional APEX)
 * preamble as a Claude `additionalContext` response, or "" when nothing to emit.
 * Guarded by {@link oncePerWindow} via {@link claudeMdKey}: only a
 * near-simultaneous double-fire of the SAME turn (identical prompt AND identical
 * block, within {@link DEDUP_WINDOW_MS}) is suppressed. The invariant "CLAUDE.md
 * is emitted on EVERY message" is thus preserved.
 * @param prompt - The raw user prompt.
 * @param cwd - Project root (for project-type detection).
 * @param id - Harness target id (defaults to "claude-code" — zero-regression default).
 * @returns The native hook stdout (possibly empty).
 */
export function promptSubmitContext(prompt: string, cwd: string, id: string = "claude-code"): string {
  const ctx = buildClaudeMdContext(prompt, cwd, id);
  if (!ctx) return "";
  if (!oncePerWindow(claudeMdKey(prompt, ctx), DEDUP_WINDOW_MS)) return "";
  return attachSystemMessage(contextResponse("UserPromptSubmit", ctx), `${apexDocName(id)} injected`);
}

/**
 * PreToolUse Task context injection: render the APEX sub-agent context as a
 * Claude `additionalContext` response when `.claude/apex/` exists, else "".
 * Harness-produced (not owner CLAUDE.md content), so it is subject to the
 * per-fragment {@link capFragment} budget — unlike {@link promptSubmitContext}.
 * @param cwd - Fallback project root when `CLAUDE_PROJECT_DIR` is unset.
 * @param id - Harness target id (defaults to "claude-code" — zero-regression default).
 * @returns The native hook stdout (possibly empty).
 */
export function taskContext(cwd: string, id: string = "claude-code"): string {
  const ctx = buildApexTaskInjection(process.env.CLAUDE_PROJECT_DIR ?? cwd, id);
  return ctx ? contextResponse("PreToolUse", capFragment("apex-task", ctx)) : "";
}
