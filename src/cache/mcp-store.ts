import { join } from "node:path";
import { atomicWrite } from "../util/json-io";
import { compactMarkdown, jaccardSimilar, queryHash } from "./compact";
import { loadIndex } from "./io";
import { cacheStore } from "./store";

/** A persisted MCP cache index entry. */
interface IndexEntry {
  tool: string;
  query: string;
  hash: string;
  ts: string;
}

/** UTC timestamp `YYYY-MM-DDTHH:MM:SSZ` (no millis), mirroring the Python store. */
function stamp(now: number): string {
  return new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** True when a Jaccard-similar query already exists for `tool` in `index`. */
function isDuplicate(index: unknown[], tool: string, query: string): boolean {
  return index.some((e) => {
    if (typeof e !== "object" || e === null) return false;
    const r = e as { tool?: unknown; query?: unknown };
    return r.tool === tool && typeof r.query === "string" && jaccardSimilar(r.query, query);
  });
}

/**
 * Persist an MCP doc result the way `cache-mcp-result.py` does: compact the body,
 * skip Jaccard-duplicate queries, write a front-matter `.md` (exact FNV key, so
 * {@link cacheLookup} still hits) carrying the query for substring lookups, and
 * append the entry to `index.json`. No-op on empty body or duplicate query.
 * @param dir - Cache directory (also holds `index.json`).
 * @param tool - MCP tool id.
 * @param query - Doc query that keys the entry.
 * @param body - Raw response text (compacted before write).
 * @param now - Current epoch ms (timestamp source).
 */
export function mcpCacheWrite(dir: string, tool: string, query: string, body: string, now: number): void {
  const compacted = compactMarkdown(body);
  if (!compacted) return;
  const indexPath = join(dir, "index.json");
  const index = loadIndex(indexPath);
  if (isDuplicate(index, tool, query)) return;
  const hash = queryHash(tool, query);
  const ts = stamp(now);
  const front = `---\ntool: ${tool}\nquery: ${JSON.stringify(query)}\nts: ${ts}\nhash: ${hash}\n---\n\n`;
  cacheStore(dir, tool, query, front + compacted);
  index.push({ tool, query, hash, ts } satisfies IndexEntry);
  atomicWrite(indexPath, JSON.stringify(index, null, 2));
}

/**
 * Persist a WebFetch result the way `webfetch-cache-store.py` does: compact the
 * body, write a front-matter `.md` keyed by `key` (url + prompt[:500]). No index
 * and no dedup — WebFetch entries are exact-key only. No-op on empty body.
 * @param dir - Cache directory.
 * @param tool - Always `WebFetch`.
 * @param key - The url+prompt cache key string.
 * @param body - Raw response text (compacted before write).
 * @param now - Current epoch ms (timestamp source).
 */
export function webfetchCacheWrite(dir: string, tool: string, key: string, body: string, now: number): void {
  const compacted = compactMarkdown(body);
  if (!compacted) return;
  const hash = queryHash(tool, key);
  const front = `---\ntool: ${tool}\nkey: ${JSON.stringify(key)}\nts: ${stamp(now)}\nhash: ${hash}\n---\n\n`;
  cacheStore(dir, tool, key, front + compacted);
}
