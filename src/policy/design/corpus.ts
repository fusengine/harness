/**
 * Corpus anchoring for the design pipeline: refs-design/ read classification,
 * per-mode readiness, citation form, citation↔read jointure. Nothing about
 * the corpus content (slugs, section titles, count) is hardcoded — everything
 * is matched by shape or discovered on disk, so a new reference or a renamed
 * section never requires reopening the harness. Pure string logic only; root
 * resolution and the write guard live in `corpus-resolve.ts`.
 */
import { basename, join } from "node:path";
import type { DesignMode } from "./state";

export { resolveCorpusRoot, resolvePluginsRoot, pluginsWriteGuard } from "./corpus-resolve";

/** What a read under the corpus root is: the index, or a tokens-* procedure file. */
export type CorpusKind = "index" | "tokens";

const TOKENS_RE = /^tokens-.+\.md$/;
const CORPUS_LINE_RE = /^[-*]\s*Corpus:\s*(.+)$/gim;

/** Classify a read path against the DELIVERED corpus root (null = not a corpus read). */
export function classifyCorpusRead(filePath: string, corpusRoot: string): CorpusKind | null {
  if (!corpusRoot) return null;
  if (filePath === join(corpusRoot, "README.md")) return "index";
  if (filePath.startsWith(`${corpusRoot}/`) && TOKENS_RE.test(basename(filePath))) return "tokens";
  return null;
}

/** Per-mode corpus-read threshold (component >= 1 file, page >= 2 files, full = index + 2 tokens). */
export function corpusReady(reads: readonly string[], mode: DesignMode): boolean {
  if (mode === "component") return reads.length >= 1;
  if (mode === "page") return reads.length >= 2;
  return reads.includes("README.md") && reads.filter((r) => TOKENS_RE.test(basename(r))).length >= 2;
}

/** True when the content carries a `- Corpus: ref/section` citation line (form only). */
export function hasCorpusCitation(content: string): boolean {
  return citedCorpusRefs(content).length > 0;
}

/**
 * Extract the reference slugs cited on EVERY `- Corpus:` line (token before
 * `/`, or a bare slug). Anchored at line start with NO indentation
 * (fail-closed: a citation inside a code block does not count — an indented
 * match would also recognize the examples inside the doctrine doc itself).
 * The regex is fence-blind, documented: a `- Corpus:` line at column 0 inside
 * a fenced block WILL be matched — its refs must join like any other.
 */
export function citedCorpusRefs(content: string): string[] {
  const refs: string[] = [];
  for (const m of content.matchAll(CORPUS_LINE_RE)) {
    const line = m[1] ?? "";
    refs.push(...line.split(",").map((item) => item.trim().match(/^([\w][\w-]*)(?:\/|\s|$)/)?.[1] ?? "").filter(Boolean));
  }
  return refs;
}

/**
 * True when the cited ref names a REFERENCE in a recorded corpus read, in
 * either naming convention (`reve` README-style ↔ `reve-recode/` on disk —
 * the `-recode` suffix is normalized away on BOTH sides) and either layout
 * (per-reference directories, or flat `tokens-<ref>.md` files). Comparison is
 * exact after normalization: no prefix matching, so `acme` never joins
 * `acme-corp`, `tokens` never joins every tokens file, and `README` names no
 * reference.
 */
export function citationJoinsReads(ref: string, reads: readonly string[]): boolean {
  const norm = (s: string): string => s.replace(/\.md$/, "").replace(/-recode$/, "");
  const target = norm(ref);
  return reads.some((r) => {
    const segs = r.split("/");
    const file = segs[segs.length - 1] ?? "";
    const names = segs.slice(0, -1).map(norm);
    if (file.startsWith("tokens-")) names.push(norm(file.slice("tokens-".length)));
    return names.includes(target);
  });
}
