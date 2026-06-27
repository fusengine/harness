import { existsSync, readFileSync } from "node:fs";
import { countLines } from "../policy/file-size";

/**
 * Code-only line count of the existing on-disk file (undefined if
 * absent/unreadable). Uses {@link countLines} (skips blank/comment lines) so a
 * partial Edit judges the full file by the SAME metric as the incoming snippet —
 * a raw `split("\n").length` would over-count JSDoc/blank lines (and add a
 * trailing-newline off-by-one), falsely blocking well-documented files.
 * @param path - Absolute path of the file being edited (or undefined).
 * @returns Code-only line count, or undefined when the file is absent/unreadable.
 */
export function existingLineCount(path: string | undefined): number | undefined {
  if (!path) return undefined;
  try {
    return existsSync(path) ? countLines(readFileSync(path, "utf8")) : undefined;
  } catch {
    return undefined;
  }
}
