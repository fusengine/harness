import { existsSync, readFileSync } from "node:fs";
import { countLines } from "../policy/file-size";

/** Source extensions the APEX gates apply to (parity: require-apex-agents.py CODE_EXT). */
const CODE_EXT = /\.(ts|tsx|js|jsx|py|go|rs|java|php|cpp|c|rb|swift|kt|dart|vue|svelte|astro)$/;

/** Paths exempt from the APEX gates even when they are code (parity: require-apex-agents.py EXEMPT_PATTERNS). */
const EXEMPT_PATTERNS: readonly RegExp[] = [
  /\.claude-plugin\//,
  /CHANGELOG\.md$/,
  /marketplace\.json$/,
  /\/\.claude\/(apex|memory|logs)\//,
  /\/\.fuse-harness\//,
];

/**
 * True when `filePath` is a code file the APEX freshness/doc/SOLID gates should
 * police — i.e. it matches a tracked source extension AND no exempt pattern.
 * Mirrors require-apex-agents.py so non-code (and exempt) paths skip those gates.
 * @param filePath - Absolute path of the edit target (or undefined).
 * @returns Whether the APEX gates apply to this path.
 */
export function isApexScoped(filePath: string | undefined): boolean {
  if (!filePath || !CODE_EXT.test(filePath)) return false;
  return !EXEMPT_PATTERNS.some((p) => p.test(filePath));
}

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
