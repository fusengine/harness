/**
 * Shared recognition of a lesson's `[TRIGGERS …]` tag, own-line OR trailing
 * inline (same line as the bullet text). One source of truth for the trigger
 * index (arming), the archive protection, the dedup carry-over and the
 * SessionStart injection (which strips the inline tag from the shown text).
 */

const OPEN = "[TRIGGERS";

/** Result of {@link splitInlineTag}: the text without the tag, and the tag body. */
export interface InlineTagSplit {
  /** Text with the trailing tag (and the whitespace before it) removed. */
  readonly text: string;
  /** Raw tag body (between `[TRIGGERS` and the closing `]`), trimmed. */
  readonly body: string;
}

/** True when the bracket opened at `start` closes exactly at the last char of `s`. */
function closesAtEnd(s: string, start: number): boolean {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === "[") depth++;
    else if (s[i] === "]" && --depth === 0) return i === s.length - 1;
  }
  return false;
}

/**
 * Detect a `[TRIGGERS …]` tag at the very END of `text` (preceded by whitespace).
 * A tag anywhere else (mid-sentence) is NOT a tag. Brackets inside the body
 * (e.g. an `error:` regex like `[a-z]+`) are balanced, so they do not end it early.
 * A tag-only bullet (nothing but an optional `-` marker before it) is NOT a tag.
 * @param text - A bullet line, or a bullet's joined text.
 * @returns The split, or null when `text` does not end with such a tag.
 */
export function splitInlineTag(text: string): InlineTagSplit | null {
  const s = text.trimEnd();
  if (!s.endsWith("]")) return null;
  for (let at = s.lastIndexOf(OPEN); at > 0; at = s.lastIndexOf(OPEN, at - 1)) {
    if (!/\s/.test(s[at - 1] ?? "") || !/\s/.test(s[at + OPEN.length] ?? "")) continue;
    if (!closesAtEnd(s, at)) continue;
    const body = s.slice(at + OPEN.length, -1).trim();
    const rest = s.slice(0, at).trimEnd();
    return body && !/^-?$/.test(rest) ? { text: rest, body } : null;
  }
  return null;
}
