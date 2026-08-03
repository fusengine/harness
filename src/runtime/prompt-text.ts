/**
 * Normalizes a hook payload's `prompt` field across harness shapes: a plain
 * string (Claude Code, Codex) or an array of content blocks (Kimi 0.31.1 —
 * captured live: `[{"type":"text","text":"..."}]` on `UserPromptSubmit`).
 * Never throws: this runs inside a hook, where an exception breaks the harness.
 */

/** A Kimi-shaped prompt content block: any object carrying a `text` string. */
interface PromptTextBlock {
  text: string;
}

/** True for an object whose `text` property is a string (the only field this reads). */
function hasTextField(value: unknown): value is PromptTextBlock {
  return typeof value === "object" && value !== null && typeof (value as { text?: unknown }).text === "string";
}

/**
 * Coerce a hook payload's `prompt` field to plain text.
 *
 * - A string is returned AS-IS (same reference, no trim/normalize) — this is
 *   the identity branch that guarantees zero regression on Claude Code/Codex,
 *   whose `prompt` is already a string.
 * - An array (Kimi's content-block shape) is flattened: every element with a
 *   string `.text` is kept, joined with `"\n"` — one block per line, since
 *   downstream consumers ({@link detectCreationIntent}, {@link detectMode})
 *   only run `\b`-anchored regexes with no line-start/end assumption, so a
 *   newline join is safe and reads like the multi-turn/multi-block source.
 * - Anything else (`undefined`, `null`, a number, a plain object) yields `""`.
 *
 * @param value - The raw `prompt` field from a hook payload (unknown shape).
 * @returns The prompt text, or `""` when it cannot be recovered.
 */
export function promptText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter(hasTextField).map((b) => b.text).join("\n");
  return "";
}
