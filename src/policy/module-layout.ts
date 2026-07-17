/**
 * Module-aware suggestion helper, shared by every framework SOLID gate
 * (react/next/laravel/swift/go/rust). Detection is purely path-based — no
 * filesystem access — so it works identically for both Write (full content,
 * real path) and Edit (snippet, real path).
 */

/** Matches a `modules/<name>/` path segment anywhere in the file path. */
const MODULE_SEGMENT_RE: RegExp = /(?:^|\/)modules\/([^/]+)\//;

/**
 * Extract the module name from a `modules/<name>/…` path segment.
 * @param filePath - path of the file under validation
 * @returns the module name, or `undefined` when the file isn't inside `modules/<name>/`
 */
export function moduleName(filePath: string): string | undefined {
  return MODULE_SEGMENT_RE.exec(filePath)?.[1];
}

/**
 * Build a module-aware destination suggestion. When `filePath` sits inside a
 * `modules/<name>/` directory, nests `subpath` under that module; otherwise
 * falls back to the language's own default convention.
 * @param filePath - path of the file under validation
 * @param subpath - subpath to nest inside `modules/<name>/` when a module is detected
 * @param fallback - suggestion to use when no module is detected
 */
export function moduleAwarePath(filePath: string, subpath: string, fallback: string): string {
  const name = moduleName(filePath);
  return name ? `modules/${name}/${subpath}` : fallback;
}
