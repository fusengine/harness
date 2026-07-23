/**
 * State-store declaration detection over MASKED content — Zustand (React
 * family) and Pinia (Vue family), per the owner's framework scoping: a rule
 * only fires inside its own family (the gate checks the project deps, this
 * module only reads content). Canonical home: `src/stores/`, `*.store.ts`,
 * one store per domain, budget = ratio 0.4 of the global line limit.
 *
 * Signature-strict (audit lesson): `Object.create(` and home-made
 * `create(` factories never match — Zustand requires the `zustand` import
 * (or the v5 curried `create<T>()(...)` call), Pinia requires the `pinia`
 * import alongside `defineStore(`.
 */
import { maskCommentsAndStrings, maskCommentsOnly } from "./strip";

/** Store library whose declarations are being scanned. */
export type StoreLib = "zustand" | "pinia";

/** Import line of the store package — comments masked (a `// import …` line
 * never matches), strings KEPT (masking would blank the module literal). */
const STORE_IMPORT_RE: Record<StoreLib, RegExp> = {
  zustand: /^\s*import\s+[^;]*from\s+['"]zustand/m,
  pinia: /^\s*import\s+[^;]*from\s+['"]pinia/m,
};

/** Zustand v5 curried declaration: `export const useX = create<S>()(`. */
const ZUSTAND_CURRIED_RE = /^\s*export\s+const\s+\w+\s*=\s*create\s*<[^=]*>\s*\(\s*\)\s*\(/m;
/** Zustand declaration with import context: `export const useX = create(`. */
const ZUSTAND_DECL_RE = /^\s*export\s+const\s+\w+\s*=\s*create(?:Store)?\s*(?:<[^(]+>)?\s*\(/m;
/** Pinia declaration: `export const useX = defineStore(`. */
const PINIA_DECL_RE = /^\s*export\s+const\s+\w+\s*=\s*defineStore\s*\(/m;

/**
 * True when the file declares a store of the given library (masked scan,
 * signature-strict).
 * @param content - Raw file content.
 * @param lib - Store library to detect.
 */
export function declaresStore(content: string, lib: StoreLib): boolean {
  const masked = maskCommentsAndStrings(content, "c");
  const importable = maskCommentsOnly(content, "c");
  if (lib === "pinia") return STORE_IMPORT_RE.pinia.test(importable) && PINIA_DECL_RE.test(masked);
  return ZUSTAND_CURRIED_RE.test(masked) || (STORE_IMPORT_RE.zustand.test(importable) && ZUSTAND_DECL_RE.test(masked));
}

/**
 * Count store declarations in one file (multi-store advisory: one per domain).
 * @param content - Raw file content.
 * @param lib - Store library to count.
 */
export function countStores(content: string, lib: StoreLib): number {
  const masked = maskCommentsAndStrings(content, "c");
  const re = lib === "pinia" ? PINIA_DECL_RE : ZUSTAND_DECL_RE;
  const curried = masked.match(new RegExp(ZUSTAND_CURRIED_RE.source, "gm"))?.length ?? 0;
  const plain = masked.match(new RegExp(re.source, "gm"))?.length ?? 0;
  return lib === "pinia" ? plain : Math.max(curried, plain);
}
