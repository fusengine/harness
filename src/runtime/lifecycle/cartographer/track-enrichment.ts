/**
 * Enrichment tracker (PostToolUse Edit/Write on `.cartographer/**\/index.md`).
 * Ports `track-enrichment.py`: persists manual descriptions to a sidecar so the
 * next regeneration can preserve them.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnrichment } from "../../../policy/cartographer/entry";

/** Shape of the `.enriched.json` sidecar. */
interface EnrichedSidecar {
  version: number;
  entries: Record<string, string>;
}

/**
 * Record manually-edited descriptions from a cartographer `index.md` into the
 * adjacent `.enriched.json` sidecar. No-op for unrelated paths. No stdout.
 * @param filePath - The edited file path.
 */
export function trackEnrichment(filePath: string): void {
  if (!filePath || !filePath.includes(".cartographer") || !filePath.endsWith("index.md")) return;
  if (!existsSync(filePath)) return;
  const sidecar = join(dirname(filePath), ".enriched.json");
  let existing: EnrichedSidecar = { version: 1, entries: {} };
  if (existsSync(sidecar)) {
    try {
      existing = JSON.parse(readFileSync(sidecar, "utf-8")) as EnrichedSidecar;
    } catch { /* keep default */ }
  }
  const entries = (existing.entries ??= {});
  let text = "";
  try {
    text = readFileSync(filePath, "utf-8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const e = parseEnrichment(line);
    if (e) entries[e[0]] = e[1];
  }
  try {
    writeFileSync(sidecar, JSON.stringify(existing, null, 2) + "\n", "utf-8");
  } catch { /* best effort */ }
}
