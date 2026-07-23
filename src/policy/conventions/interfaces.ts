/**
 * Interface/type-contract declaration detection, per language, over MASKED
 * content (see `strip.ts` — comments and strings never match). Single source
 * consumed by every interface gate; the four historical layers each carried
 * their own regexes (alias `type X =` false positives, unanchored
 * `class.*ABC`, missed `public protocol`/`sealed interface`/generics).
 *
 * Rule symmetry (owner spec): an EXPORTED contract belongs to its directory
 * (interfaces/ resp. types/); a non-exported local declaration is allowed.
 *
 * Each detection carries a LEVEL: `"legacy"` (the exact historical semantics,
 * hard deny byte-identical) vs `"extended"` (syntax widenings — Go
 * `interface{` without the space, Python `Protocol` — advisory-first via
 * `FUSE_CONVENTIONS_MODE`, owner Amendment 5). Go anchors at column 0: an
 * interface declared INSIDE a function (indented, a true false positive — a
 * local type cannot move to internal/interfaces/) never matches.
 */
import { langOfPath, lexProfileOf, type LangFamily } from "./langs";
import { maskCommentsAndStrings } from "./strip";

/** Detection level: historical semantics (hard deny) vs advisory widening. */
export type InterfaceDeclLevel = "legacy" | "extended";

const LEGACY_RE: Partial<Record<LangFamily, RegExp>> = {
  ts: /^\s*export\s+(?:declare\s+)?interface\s+\w+/m,
  py: /^\s*class\s+\w+\s*\([^)]*\b(?:ABC|ABCMeta)\b/m,
  go: /^type\s+\w+\s+interface\s+\{/m,
  rs: /^\s*(?:pub\s+)?trait\s+\w+/m,
  java: /^\s*(?:(?:public|sealed|final|abstract)\s+)*(?:interface|@FunctionalInterface)\s*\w*|^\s*fun\s+interface\s+\w+/m,
  php: /^\s*(?:abstract\s+class|interface)\s+\w+/m,
  swift: /^\s*(?:(?:public|open|internal|private|fileprivate)\s+)?protocol\s+\w+/m,
};

const EXTENDED_RE: Partial<Record<LangFamily, RegExp>> = {
  py: /^\s*class\s+\w+\s*\([^)]*\bProtocol\b/m,
  go: /^type\s+\w+\s+interface\b/m,
};

/** Exported TS type alias (`export type X = …`) — belongs in `src/types/`. */
const TYPE_ALIAS_RE = /^\s*export\s+type\s+\w+\s*[=<]/m;

/**
 * Classify the interface declaration level of a file (masked scan), or null.
 * @param filePath - File path (extension selects the language).
 * @param content - Raw file content (masked internally).
 */
export function interfaceDeclLevel(filePath: string, content: string): InterfaceDeclLevel | null {
  const lang = langOfPath(filePath);
  if (!lang) return null;
  const masked = maskCommentsAndStrings(content, lexProfileOf(lang));
  if (LEGACY_RE[lang]?.test(masked)) return "legacy";
  if (EXTENDED_RE[lang]?.test(masked)) return "extended";
  return null;
}

/**
 * True when the file declares an interface-like contract at any level.
 * @param filePath - File path (extension selects the language).
 * @param content - Raw file content (masked internally).
 */
export function declaresInterface(filePath: string, content: string): boolean {
  return interfaceDeclLevel(filePath, content) !== null;
}

/**
 * True when a TS-family file declares an EXPORTED type alias (masked scan).
 * @param content - Raw file content.
 */
export function declaresExportedTypeAlias(content: string): boolean {
  return TYPE_ALIAS_RE.test(maskCommentsAndStrings(content, "c"));
}
