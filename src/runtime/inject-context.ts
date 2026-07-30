import { attachSystemMessage, contextResponse } from "../adapters/claude";
import { renderInform } from "./inform";
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
 * Extract the APEX preamble portion of a `buildClaudeMdContext` result, i.e.
 * everything BEFORE the `# <docName>\n` root-doc block it prepends on dev
 * prompts. Returns "" when `ctx` has no preamble (plain prompt: `ctx` starts
 * directly with the root-doc heading).
 * @param ctx - The full `buildClaudeMdContext` return value.
 * @param docName - Root doc file name (e.g. "AGENTS.md").
 * @returns The preamble text, or "" when absent.
 */
function extractApexPreamble(ctx: string, docName: string): string {
  const heading = `# ${docName}\n`;
  if (ctx.startsWith(heading)) return "";
  const sep = `\n\n${heading}`;
  const idx = ctx.indexOf(sep);
  return idx === -1 ? "" : ctx.slice(0, idx);
}

/**
 * UserPromptSubmit context injection: render the CLAUDE.md (+ optional APEX)
 * preamble as a Claude `additionalContext` response, or "" when nothing to emit.
 * Guarded by {@link oncePerWindow} via {@link claudeMdKey}: only a
 * near-simultaneous double-fire of the SAME turn (identical prompt AND identical
 * block, within {@link DEDUP_WINDOW_MS}) is suppressed. The invariant "CLAUDE.md
 * is emitted on EVERY message" is thus preserved.
 *
 * On kimi specifically, the root doc body is dropped from the emitted text:
 * Kimi loads `<kimiHome>/AGENTS.md` natively at session start (`apex-target.ts`),
 * so re-injecting its full body on every prompt is redundant terminal noise
 * (kimi has no model-only hook channel — `runtime/inform.ts`). The APEX
 * preamble, which is NOT part of `AGENTS.md`, is still emitted in full when the
 * prompt is dev-shaped; a plain prompt leaves only the notice.
 * @param prompt - The raw user prompt.
 * @param cwd - Project root (for project-type detection).
 * @param id - Harness target id (defaults to "claude-code" — zero-regression default).
 * @returns The native hook stdout (possibly empty).
 */
export function promptSubmitContext(prompt: string, cwd: string, id: string = "claude-code"): string {
  const ctx = buildClaudeMdContext(prompt, cwd, id);
  if (!ctx) return "";
  if (!oncePerWindow(claudeMdKey(prompt, ctx), DEDUP_WINDOW_MS)) return "";
  const notice = `${apexDocName(id)} injected`;
  if (id === "kimi") {
    const preamble = extractApexPreamble(ctx, apexDocName(id));
    return preamble ? renderInform(id, "UserPromptSubmit", preamble, notice) : notice;
  }
  return renderInform(id, "UserPromptSubmit", ctx, notice);
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
