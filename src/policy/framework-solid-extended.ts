/**
 * Extended convention violations — the NEW rules of the conventions module
 * (owner Amendments 3-5), all advisory-first: the caller wraps them with
 * {@link rolloutVerdict}, so they surface as non-blocking `inform` until
 * `FUSE_CONVENTIONS_MODE=deny`. Only fires when the legacy gates found
 * nothing (no double-reporting of cases the legacy reactGate already blocks).
 *
 * Rules: (1) custom hook outside `hooks/` — widened to `export default`/
 * `async` syntaxes and to the nextjs/tanstack family (legacy covered react
 * only); (2) hook file over its line budget — `hookBudget`, ratio 0.3 of the
 * global `FUSE_SOLID_MAX_LINES` limit (default 30; one variable drives every
 * budget, owner decision — no per-file-kind env vars); (3) TanStack Start
 * route files kept routing-only (no interface declarations in `src/routes/`);
 * (4) store declared outside `stores/` or over `storeBudget` (ratio 0.4);
 * (5) TanStack Query hook defined in a component/page (only when the
 * `@tanstack/*-query` cap is detected in the nearest manifest — `query/` or
 * `hooks/` are both accepted homes); (6) component file misplaced inside
 * `src/hooks|stores|query|interfaces|types/` (deterministic case only).
 */
import { isHooksPath, isStoresPath, isComponentsPath } from "./conventions/langs";
import { maskCommentsAndStrings } from "./conventions/strip";
import { declaresCustomHook } from "./conventions/react-hooks";
import { declaresInterface } from "./conventions/interfaces";
import { declaresStore } from "./conventions/stores";
import { declaresQueryHook, queryCapActive } from "./conventions/query";
import { isStoreOrQueryDefinition } from "./conventions/store-or-query";
import { countFrameworkCodeLines } from "./file-size";
import { hookBudget, resolveMaxLines, storeBudget } from "../config/limits";

/** TanStack Start content signal (file routes, server fns, start/router imports). */
const TANSTACK_RE = /createFileRoute|createServerFn|from ['"]@tanstack\/react-(start|router)/;
/** A custom-hook source file under a hooks directory. */
const HOOK_FILE_RE = /(^|\/)use[A-Z][^/]*\.(ts|tsx|js|jsx)$/;

/**
 * Collect the extended convention violations for a JS/TS-family file.
 * @param filePath - The written/edited file's path.
 * @param content - Its raw content (masked internally).
 * @returns The violation messages (empty when clean or out of scope).
 */
export function extendedViolations(filePath: string, content: string): string[] {
  const v: string[] = [];
  if (!/\.(tsx|ts|jsx|js|vue)$/.test(filePath)) return v;
  const masked = maskCommentsAndStrings(content, "c");
  // Store/query-definition files are governed by their own rules below,
  // never by the hook-location rule (signature+cap-gated exemption, F0.2).
  if (declaresCustomHook(content) && !isHooksPath(filePath) && !isStoreOrQueryDefinition(filePath, content)) {
    v.push("Custom hook defined outside hooks/ directory. Move to modules/[feature]/src/hooks/.");
  }
  if (isHooksPath(filePath) && HOOK_FILE_RE.test(filePath)) {
    const max = hookBudget(resolveMaxLines());
    const lines = countFrameworkCodeLines(masked);
    if (lines > max) v.push(`Hook file has ${lines} lines (limit: ${max}). Extract smaller hooks.`);
  }
  if (filePath.includes("/routes/") && TANSTACK_RE.test(masked) && declaresInterface(filePath, content)) {
    v.push("Route files are routing-only. Move the interface to src/modules/[feature]/src/interfaces/.");
  }
  // (4) Stores: location + budget (signature-strict detection — see stores.ts).
  const storeLib = declaresStore(content, "zustand") ? "zustand" : declaresStore(content, "pinia") ? "pinia" : null;
  if (storeLib && !isStoresPath(filePath)) {
    v.push("Store defined outside stores/ directory. Move to modules/[feature]/src/stores/.");
  }
  if (storeLib && isStoresPath(filePath)) {
    const max = storeBudget(resolveMaxLines());
    const lines = countFrameworkCodeLines(masked);
    if (lines > max) v.push(`Store file has ${lines} lines (limit: ${max}).`);
  }
  // (5) TanStack Query definition in a component/page — only with the cap.
  if (isComponentOrPagePath(filePath) && declaresQueryHook(content) && queryCapActive(filePath)) {
    v.push("Query hook defined outside query/ directory. Move to modules/[feature]/src/query/.");
  }
  // (6) Component misplaced inside a non-component src/ subdirectory.
  if (/\.(tsx|vue)$/.test(filePath)) {
    const m = /\/src\/(hooks|stores|query|interfaces|types)\//.exec(filePath);
    if (m && declaresComponent(masked)) {
      v.push(`Component does not belong in ${m[1]}/. Move to modules/[feature]/components/.`);
    }
  }
  return v;
}

/** Component/page directories where a store or query DEFINITION is a violation. */
function isComponentOrPagePath(filePath: string): boolean {
  return isComponentsPath(filePath) || /\/(pages|app|routes)\//.test(filePath);
}

/** True when the file declares an exported component (function/const, Vue SFC
 * `export default {}` or `defineComponent(` included — audit F0 option). */
function declaresComponent(masked: string): boolean {
  return /^\s*export\s+(?:default\s+)?(?:function|const)\s+[A-Z]\w*/m.test(masked)
    || /^\s*export\s+default\s*\{/m.test(masked)
    || /defineComponent\s*\(/.test(masked);
}
