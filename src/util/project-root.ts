import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Source-code file extensions worth tracking as "code was written". */
const CODE_EXT =
  /\.(ts|tsx|js|jsx|py|php|swift|go|rs|rb|java|vue|svelte|astro|css|kt|dart|cpp|c)$/;
/** Generated/vendored directories that never count as code. */
const SKIP_DIRS = /(node_modules|vendor|dist|build|\.next|DerivedData|\.git)/;

/** True for a source-code file outside generated/vendored directories. */
export function isCodeFile(p: string): boolean {
  return CODE_EXT.test(p) && !SKIP_DIRS.test(p);
}

/**
 * Walk up from `dir` to the nearest ancestor directory containing `marker`.
 * @param dir - Starting directory.
 * @param marker - Sibling file/dir name to look for at each level.
 * @returns The ancestor holding `marker`, or `null` at filesystem root.
 */
export function walkUpFor(dir: string, marker: string): string | null {
  let current = resolve(dir);
  while (current !== "/") {
    if (existsSync(`${current}/${marker}`)) return current;
    current = dirname(current);
  }
  return null;
}

/**
 * Resolve the project root, preferring the repo boundary (`.git`) over a
 * nested `package.json` — avoids false roots in monorepos. Null if none found.
 */
export function projectRootOrNull(dir: string): string | null {
  return walkUpFor(dir, ".git") ?? walkUpFor(dir, "package.json");
}

/** Like {@link projectRootOrNull} but falls back to `process.cwd()`. */
export function projectRoot(dir: string): string {
  return projectRootOrNull(dir) ?? process.cwd();
}
