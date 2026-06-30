import { resolveMaxLines, splitTarget } from "../config/limits";

/** Verdict from {@link evaluateFileSize}. */
export interface FileSizeVerdict {
  ok: boolean;
  lines: number;
  max: number;
  message: string | null;
}

/**
 * Count physical lines — parity with the Python `enforce-file-size.py`
 * (`sum(1 for _ in f)`): every line counts (blanks and comments included), and a
 * single trailing newline does not add a phantom line. The SOLID ceiling is
 * measured on raw file length, not substantive code, to match the upstream plugin.
 */
export function countLines(content: string): number {
  if (content === "") return 0;
  return content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
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
