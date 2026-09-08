import { extname } from "node:path";

/**
 * Dot-prefixed source-code extensions tracked across the lifecycle hooks
 * (sniper change-tracking, SOLID/receipt validation, ecosystem detection).
 * Single source of truth — replaces three lists that had independently
 * drifted: `track-changes.ts` `CODE_EXT` (missing `dart`), `task-completed.ts`
 * `CODE_EXTENSIONS` (missing `.mts`/`.cts`/`.mjs`/`.cjs`), and `receipt-hint.ts`
 * `ECOSYSTEMS`' JS/TS extensions (listed `.mts`/`.cts` but the gate upstream
 * never let them through). Keep the bash-write guard's own `CODE_EXT` in
 * `src/policy/guards/bash-write-patterns.ts` separate — different concern
 * (policy layer, not lifecycle hooks).
 */
export const CODE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".php", ".cpp", ".c", ".rb",
  ".swift", ".kt", ".dart", ".vue", ".svelte", ".astro",
]);

/**
 * Whether `path` has a tracked source-code extension (case-insensitive).
 * @param path - File path to check.
 * @returns True when `extname(path)` (lower-cased) is in {@link CODE_EXTENSIONS}.
 */
export function isCodeFile(path: string): boolean {
  return CODE_EXTENSIONS.has(extname(path).toLowerCase());
}
