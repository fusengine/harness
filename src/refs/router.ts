import { globToRe } from "./frontmatter";
import type { RefMeta, ScoredRef, RouteResult } from "./types";

/** Literal (non-wildcard) path segments in a glob — more = more specific. */
function specificity(glob: string): number {
  return glob.split("/").filter((s) => s && s !== "**" && !s.includes("*")).length;
}

/**
 * Score references against a file edit (pure):
 * +10 per `applies-to` glob match, weighted by glob SPECIFICITY (+5 per literal path
 * segment) so a more specific skill wins (an app-router glob beats a bare extension
 * glob beats a plain TS glob). +5 per `trigger-on-edit` fragment, +1 per keyword.
 */
export function scoreReferences(refs: RefMeta[], filePath: string, content: string): ScoredRef[] {
  const scored: ScoredRef[] = [];
  for (const meta of refs) {
    let score = 0;
    if (meta.appliesTo) {
      for (const g of meta.appliesTo.split(", ")) if (globToRe(g).test(filePath)) score += 10 + specificity(g) * 5;
    }
    if (meta.triggerOnEdit) {
      for (const frag of meta.triggerOnEdit.split(", ")) if (filePath.includes(frag.trim())) score += 5;
    }
    if (meta.keywords) {
      const hay = `${filePath} ${content}`.toLowerCase();
      for (const kw of meta.keywords.split(", ")) {
        const k = kw.trim().toLowerCase();
        if (k && hay.includes(k)) score += 1;
      }
    }
    if (score > 0) scored.push({ meta, score });
  }
  return scored;
}

/**
 * Route references for a file edit: top-2 required + next-2 optional, ensuring a
 * `principle` and a `template` appear in the top 4. Returns null when nothing scores.
 */
export function routeReferences(
  refs: RefMeta[],
  filePath: string,
  content: string,
  skillPath = "",
): RouteResult | null {
  const scored = scoreReferences(refs, filePath, content);
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  const hoist = (level: string): void => {
    if (scored.slice(0, 4).some((r) => r.meta.level === level)) return;
    const found = scored.find((r) => r.meta.level === level);
    if (found) {
      scored.splice(scored.indexOf(found), 1);
      scored.splice(3, 0, found);
    }
  };
  hoist("principle");
  hoist("template");
  return { required: scored.slice(0, 2), optional: scored.slice(2, 4), skillPath };
}
