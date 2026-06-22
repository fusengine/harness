import { existsSync, readFileSync } from "node:fs";

/** Read a JSON array from `path`; [] on missing/corrupt/non-array. */
export function loadIndex(path: string): unknown[] {
  try {
    if (!existsSync(path)) return [];
    const data: unknown = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Summary of a cache index. */
export interface IndexSummary {
  total: number;
  byTool: Record<string, number>;
  oldestTs: string | null;
  newestTs: string | null;
}

/** Summarize an index of `{ tool?, ts? }` entries. */
export function summarizeIndex(index: unknown[]): IndexSummary {
  const byTool: Record<string, number> = {};
  const timestamps: string[] = [];
  for (const entry of index) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as { tool?: unknown; ts?: unknown };
    if (typeof e.tool === "string") byTool[e.tool] = (byTool[e.tool] ?? 0) + 1;
    if (typeof e.ts === "string") timestamps.push(e.ts);
  }
  return {
    total: index.length,
    byTool,
    oldestTs: timestamps.length ? timestamps.reduce((a, b) => (a < b ? a : b)) : null,
    newestTs: timestamps.length ? timestamps.reduce((a, b) => (a > b ? a : b)) : null,
  };
}
