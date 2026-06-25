/**
 * Tree-entry parsing — pure line regexes. Ports the line parsers of
 * `merge_index.py` and `track-enrichment.py`.
 */

/** A parsed `prefix[name](path) — desc` tree line. */
export interface TreeEntry {
  prefix: string;
  name: string;
  path: string;
  desc: string;
}

const ENTRY_RE = /^(.*?)\[([^\]]+)\]\(([^)]+)\)\s*(?:—|-{1,2})\s*(.*)$/;
const ENRICH_RE = /^(?:.*?)\[([^\]]+)\]\(([^)]+)\)\s*(?:—|-{1,2})\s*(.+)$/;

/**
 * Parse a `merge_index` tree line into its parts. Returns null on no match.
 * @param line - The raw tree line.
 * @returns The parsed entry, or null.
 */
export function parseEntry(line: string): TreeEntry | null {
  const m = ENTRY_RE.exec(line);
  if (!m || m[1] === undefined || m[2] === undefined || m[3] === undefined || m[4] === undefined) return null;
  return { prefix: m[1], name: m[2], path: m[3], desc: m[4] };
}

/**
 * Parse an enrichment line into `[path, desc]`, requiring a non-empty desc.
 * @param line - The raw index line.
 * @returns The `[path, desc]` pair, or null.
 */
export function parseEnrichment(line: string): [string, string] | null {
  const m = ENRICH_RE.exec(line);
  if (!m || m[2] === undefined || m[3] === undefined) return null;
  const desc = m[3].trim();
  return desc ? [m[2], desc] : null;
}
