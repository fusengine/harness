import { globToRe } from "./frontmatter";
import type { RefMeta, ScoredRef, RouteResult } from "./types";

/**
 * Score references against a file edit (pure) — flat scoring, parity with the
 * Python `ref_router._score_ref` (comma-split, single award per category):
 * +10 once if ANY `applies-to` glob matches, +5 once if ANY `trigger-on-edit`
 * fragment (trailing `/` stripped) is a substring of the path, +1 per keyword.
 */
export function scoreReferences(refs: RefMeta[], filePath: string, content: string): ScoredRef[] {
  const scored: ScoredRef[] = [];
  const hay = `${filePath} ${content}`.toLowerCase();
  for (const meta of refs) {
    let score = 0;
    if (meta.appliesTo?.split(",").some((g) => g.trim() && globToRe(g.trim()).test(filePath))) score += 10;
    if (meta.triggerOnEdit?.split(",").some((f) => { const t = f.trim().replace(/\/+$/, ""); return t && filePath.includes(t); })) score += 5;
    if (meta.keywords) {
      for (const kw of meta.keywords.split(",")) {
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
