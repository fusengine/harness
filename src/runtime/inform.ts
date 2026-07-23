/**
 * Lifecycle context-injection renderer. Every emitter that injects text into
 * the model's context (rules, lessons, CLAUDE.md preamble, ...) goes through
 * here instead of calling the Claude builders directly:
 * - kimi: raw text on stdout — Kimi Code CLI appends stdout to the context on
 *   exit 0 (UserPromptSubmit is blockable; the Claude-shaped
 *   `additionalContext` envelope would be ignored or leak as raw JSON text).
 * - every other harness: the historical Claude-shaped envelope, byte-identical
 *   to what the call sites produced before this module existed (zero-regression
 *   default — `attachSystemMessage` concatenates notices with "\n", so a single
 *   combined notice equals the previous chained calls).
 */
import { attachSystemMessage, contextResponse } from "../adapters/claude";

/**
 * Render a context injection for the firing harness.
 * @param id - Harness id.
 * @param event - The firing hook event name (envelope tag for Claude shapes).
 * @param text - The context body to inject.
 * @param notice - Optional human-facing notice (systemMessage on Claude
 * shapes; appended as plain text for kimi).
 * @returns The native hook stdout.
 */
export function renderInform(id: string, event: string, text: string, notice?: string): string {
  if (id === "kimi") return notice ? `${text}\n\n${notice}` : text;
  const base = contextResponse(event, text);
  return notice ? attachSystemMessage(base, notice) : base;
}
