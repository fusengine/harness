import { existsSync, readFileSync } from "node:fs";
import { countFrameworkCodeLines, countLines } from "../policy/file-size";

/** Source extensions the APEX gates apply to (parity: require-apex-agents.py CODE_EXT). */
const CODE_EXT = /\.(ts|tsx|js|jsx|py|go|rs|java|php|cpp|c|rb|swift|kt|dart|vue|svelte|astro)$/;

/** Paths exempt from the APEX gates even when they are code (parity: require-apex-agents.py EXEMPT_PATTERNS). */
const EXEMPT_PATTERNS: readonly RegExp[] = [
  /\.claude-plugin\//,
  /CHANGELOG\.md$/,
  /marketplace\.json$/,
  /\/\.claude\/(apex|memory|logs|fusengine-cache)\//,
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

/** Raw + code-only line counts of the existing on-disk file. */
export interface ExistingLineCounts {
  /** Raw physical count — parity with core-guards `enforce-file-size.py` (`sum(1 for _ in f)`), fed to the generic `evaluate()` ceiling. */
  raw?: number;
  /** Code-only count (blank/comment lines excluded) — parity with the framework validators' `count_code_lines`, fed to `frameworkSkillGate`. */
  code?: number;
}

/**
 * Read `path` once and derive both line-count metrics, so the generic
 * core-guards ceiling (`raw`) and the framework SOLID gates (`code`) each get
 * the metric their own Python origin measures, without reading the file twice.
 * @param path - Absolute path of the file being edited (or undefined).
 */
export function existingLineCounts(path: string | undefined): ExistingLineCounts {
  if (!path || !existsSync(path)) return {};
  try {
    const content = readFileSync(path, "utf8");
    return { raw: countLines(content), code: countFrameworkCodeLines(content) };
  } catch {
    return {};
  }
}
