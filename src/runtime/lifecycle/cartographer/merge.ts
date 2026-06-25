/**
 * Index merge — preserves enriched descriptions across regenerations. Ports
 * `merge_index.py` (merge_lines + .enriched.json sidecar).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEntry } from "../../../policy/cartographer/entry";

/**
 * Load the `.enriched.json` sidecar's `entries` map for an output index.
 * @param outputIndexPath - Path to the index.md being written.
 * @returns The path→desc enrichment map (possibly empty).
 */
export function loadEnriched(outputIndexPath: string): Record<string, string> {
  const sidecar = join(dirname(outputIndexPath), ".enriched.json");
  try {
    if (!existsSync(sidecar)) return {};
    const data = JSON.parse(readFileSync(sidecar, "utf-8")) as { entries?: Record<string, string> };
    return data.entries ?? {};
  } catch {
    return {};
  }
}

/**
 * Merge freshly generated lines with prior descriptions: enriched sidecar wins,
 * else a longer pre-existing description is preserved.
 * @param newLines - The freshly generated index lines.
 * @param outputIndexPath - Path to the existing index.md (if any).
 * @returns The merged lines.
 */
export function mergeLines(newLines: string[], outputIndexPath: string): string[] {
  const enriched = loadEnriched(outputIndexPath);
  const existingDescs: Record<string, string> = {};
  if (existsSync(outputIndexPath)) {
    try {
      for (const line of readFileSync(outputIndexPath, "utf-8").split("\n")) {
        const e = parseEntry(line);
        if (e) existingDescs[e.path] = e.desc;
      }
    } catch { /* ignore */ }
  }
  return newLines.map((line) => {
    const e = parseEntry(line);
    if (!e) return line;
    if (e.path in enriched) return `${e.prefix}[${e.name}](${e.path}) — ${enriched[e.path]}`;
    const old = existingDescs[e.path] ?? "";
    if (old.length > e.desc.length) return `${e.prefix}[${e.name}](${e.path}) — ${old}`;
    return line;
  });
}
