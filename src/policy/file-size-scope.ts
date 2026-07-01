import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

/**
 * File-size gate scope — parity `enforce-file-size.py` CODE_EXT (both pre- and
 * post-tool-use variants; deliberately excludes `.css`, matching the product
 * decision already applied to `runtime/gate-helpers.ts::isApexScoped` for the
 * sibling `require-apex-agents.py`). NOT `util/project-root.ts::isCodeFile`, a
 * broader general-purpose predicate whose other two callers (`cli/run.ts`,
 * `lifecycle/lessons/dispatch.ts`) are unrelated to this Python source.
 */
const FILE_SIZE_CODE_EXT = /\.(ts|tsx|js|jsx|py|go|rs|java|php|cpp|c|rb|swift|kt|dart|vue|svelte|astro)$/;

/** True when `filePath` is in scope for the SOLID file-size gate (see {@link FILE_SIZE_CODE_EXT}). */
export function isFileSizeScoped(filePath: string): boolean {
  return FILE_SIZE_CODE_EXT.test(filePath);
}

/**
 * Resolve the SOLID_REF framework key for a file — parity with Python
 * `enforce-file-size.py::get_solid_ref()` (NOT `detectFramework()`, which backs
 * the unrelated require-solid-read pipeline and keys off filename/content
 * heuristics that script never checks). Matches Python exactly:
 * - ts/tsx/js/jsx: "nextjs" only when `next.config.js`/`next.config.ts` sits in
 *   the SAME directory as the file (Python's literal `os.path.dirname(fp)`
 *   check, not a project-root search) — else "react".
 * - vue/svelte/py/go/rs/java/cpp/c/rb/kt/dart/astro: "generic" (Python's
 *   `SOLID_MAP.get(ext, 'generic/')` fallback — none of these are map keys).
 * - php: "laravel"; swift: "swift".
 * @param filePath - Absolute path of the file being written/edited.
 */
export function resolveSolidRefFramework(filePath: string): string {
  const ext = filePath.includes(".") ? filePath.slice(filePath.lastIndexOf(".") + 1) : "";
  if (ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx") {
    const dir = dirname(filePath);
    const hasNextConfig = ["next.config.js", "next.config.ts"].some((c) => existsSync(join(dir, c)));
    return hasNextConfig ? "nextjs" : "react";
  }
  if (ext === "php") return "laravel";
  if (ext === "swift") return "swift";
  return "generic";
}
