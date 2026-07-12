import { detectFramework } from "./detect-framework";

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
 * Resolve the SOLID_REF framework key for a file — now project-real via
 * {@link detectFramework} (nearest-manifest caps ∩ file signal), NOT the old
 * extension-only default that mislabeled every `.ts` as react (the "twin bug" of
 * the require-solid-read pipeline; it only escaped when `next.config` sat in the
 * SAME dir). A backend `.ts` in a react project — or any `.ts` in this generic
 * Bun repo — now resolves to "generic". Content is unavailable at this call site
 * (evaluate.ts:59 passes only the path), so `.tsx`/`.jsx` still resolve via caps
 * while `.ts`/`.js` lacking a content signal fall to "generic". Return values
 * stay in the existing union; fail-open to "generic".
 * @param filePath - Absolute path of the file being written/edited.
 */
export function resolveSolidRefFramework(filePath: string): string {
  return detectFramework(filePath, "");
}
