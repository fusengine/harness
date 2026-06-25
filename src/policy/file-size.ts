import { resolveMaxLines, splitTarget } from "../config/limits";

/** Verdict from {@link evaluateFileSize}. */
export interface FileSizeVerdict {
  ok: boolean;
  lines: number;
  max: number;
  message: string | null;
}

/**
 * Count substantive (code-only) lines — blank lines and comment-only lines
 * (`//`, `*`, `/*` block-comment bodies) don't count toward the SOLID limit, so a
 * well-documented file isn't penalized for its JSDoc. (`#` is intentionally NOT
 * skipped: it is code in Rust `#[derive]` and C `#include`, not a comment.)
 */
export function countLines(content: string): number {
  if (content === "") return 0;
  let n = 0;
  for (const line of content.split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("//") || s.startsWith("*") || s.startsWith("/*")) continue;
    n++;
  }
  return n;
}

/**
 * Evaluate a file's line count against the SOLID limit.
 * @param lines - the file's line count
 * @param max - the limit (defaults to `resolveMaxLines()`)
 */
export function evaluateFileSize(lines: number, max: number = resolveMaxLines()): FileSizeVerdict {
  if (lines <= max) return { ok: true, lines, max, message: null };
  const split = splitTarget(max);
  return {
    ok: false,
    lines,
    max,
    message: `File has ${lines} lines (max: ${max}). Split into modules under ${split} lines (Single Responsibility).`,
  };
}
