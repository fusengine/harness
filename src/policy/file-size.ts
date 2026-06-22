import { resolveMaxLines, splitTarget } from "../config/limits";

/** Verdict from {@link evaluateFileSize}. */
export interface FileSizeVerdict {
  ok: boolean;
  lines: number;
  max: number;
  message: string | null;
}

/** Count lines in file content (empty string = 0). */
export function countLines(content: string): number {
  return content === "" ? 0 : content.split("\n").length;
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
