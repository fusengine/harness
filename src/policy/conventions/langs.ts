/**
 * Language detection and canonical convention paths. Single source for
 * "which family does this extension belong to" and "is this path already in
 * the right convention directory" — every convention gate (interfaces,
 * types, hooks, stores, query) consumes these predicates instead of
 * re-deriving its own path rules.
 *
 * Canonical module structure (owner spec, 2026-07):
 *   modules/<feature>/components/      reusable module components
 *   modules/<feature>/src/interfaces/  interface Foo { } contracts
 *   modules/<feature>/src/types/       exported type aliases
 *   modules/<feature>/src/hooks/       custom use* hooks
 *   modules/<feature>/src/stores/      *.store.ts (Zustand, Pinia)
 *   modules/<feature>/src/query/       TanStack Query definitions
 * (+ modules/cores/… for cross-feature code)
 */
import type { LexProfile } from "./strip";

/** Language family a convention rule applies to, or null when out of scope. */
export type LangFamily = "ts" | "py" | "go" | "rs" | "java" | "php" | "swift" | "rb" | "vue";

const EXT_LANG: Record<string, LangFamily> = {
  ts: "ts", tsx: "ts", js: "ts", jsx: "ts", mts: "ts", mjs: "ts", astro: "ts", svelte: "ts",
  py: "py", go: "go", rs: "rs", java: "java", kt: "java",
  php: "php", swift: "swift", rb: "rb", vue: "vue",
};

/** Language family for a file path (by extension), or null when unsupported. */
export function langOfPath(filePath: string): LangFamily | null {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? null;
}

/** Lexical profile for masking, derived from the language family. */
export function lexProfileOf(lang: LangFamily): LexProfile {
  if (lang === "py") return "py";
  if (lang === "rb") return "rb";
  if (lang === "php") return "php";
  return "c";
}

/** True for dotfiles/dependency dirs never subject to conventions. */
export function isVendorPath(filePath: string): boolean {
  return /(^|\/)(node_modules|vendor|dist|build|\.next|coverage)\//.test(filePath);
}

/** Path predicates — canonical convention directories. */
export const isInterfacesPath = (p: string): boolean => /\/(interfaces|Contracts|Protocols|traits)\//.test(p) || p.endsWith("traits.rs");
export const isTypesPath = (p: string): boolean => p.includes("/types/") || p.endsWith(".d.ts");
export const isHooksPath = (p: string): boolean => p.includes("/hooks/") || p.includes("/composables/");
export const isStoresPath = (p: string): boolean => p.includes("/stores/");
export const isQueryPath = (p: string): boolean => p.includes("/query/");
export const isComponentsPath = (p: string): boolean => p.includes("/components/");
