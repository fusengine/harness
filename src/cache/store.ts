import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Max body bytes read on a substring lookup (parity with mcp-cache-lookup.py MAX_BODY). */
const MAX_BODY = 8 * 1024;
/** Needle length scanned on a substring lookup (first 80 query chars, ripgrep-aligned). */
const NEEDLE_LEN = 80;

/** Stable 16-char key from a tool name + query (FNV-1a, non-crypto). */
export function mcpCacheKey(tool: string, query: string): string {
  const s = `${tool}\n${query}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + (s.length >>> 0).toString(16).padStart(8, "0");
}

/** Path of a cache entry under `dir`. */
export function cachePath(dir: string, tool: string, query: string): string {
  return join(dir, `${mcpCacheKey(tool, query)}.md`);
}

/** A cache hit's body plus its age in ms (now − mtime), for caller-side reporting. */
export interface CacheHit {
  body: string;
  ageMs: number;
}

/** Read a cached entry if it exists and is fresh (mtime within `ttlMs`), else null. */
export function cacheLookup(dir: string, tool: string, query: string, ttlMs: number, now: number): string | null {
  return cacheLookupMeta(dir, tool, query, ttlMs, now)?.body ?? null;
}

/** Like {@link cacheLookup}, but also reports the entry's age (for `CACHE HIT` wrapper text). */
export function cacheLookupMeta(dir: string, tool: string, query: string, ttlMs: number, now: number): CacheHit | null {
  const path = cachePath(dir, tool, query);
  try {
    if (!existsSync(path)) return null;
    const ageMs = now - statSync(path).mtimeMs;
    if (ageMs > ttlMs) return null;
    return { body: readFileSync(path, "utf8").slice(0, MAX_BODY), ageMs };
  } catch {
    return null;
  }
}

/**
 * First fresh cache file whose body contains the (normalized, case-insensitive)
 * query substring, else null. Relaxes the exact-key match to lift the hit-rate —
 * parity with `mcp-cache-lookup.py` (`rg -i -F` over the first 80 query chars).
 * @param dir - Cache directory to scan.
 * @param query - Raw query; newlines folded to spaces, truncated to 80 chars.
 * @param ttlMs - Freshness window (mtime-based).
 * @param now - Current epoch ms.
 */
export function cacheLookupSubstring(dir: string, query: string, ttlMs: number, now: number): string | null {
  return cacheLookupSubstringMeta(dir, query, ttlMs, now)?.body ?? null;
}

/** Like {@link cacheLookupSubstring}, but also reports the matched entry's age. */
export function cacheLookupSubstringMeta(dir: string, query: string, ttlMs: number, now: number): CacheHit | null {
  const needle = query.replace(/[\r\n]+/g, " ").slice(0, NEEDLE_LEN).trim().toLowerCase();
  if (!needle) return null;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    const path = join(dir, name);
    try {
      const ageMs = now - statSync(path).mtimeMs;
      if (ageMs > ttlMs) continue;
      const body = readFileSync(path, "utf8").slice(0, MAX_BODY);
      if (body.toLowerCase().includes(needle)) return { body, ageMs };
    } catch {
      continue;
    }
  }
  return null;
}

/** Store a cache entry (creates the dir; no-op on empty content). */
export function cacheStore(dir: string, tool: string, query: string, content: string): void {
  if (!content) return;
  const path = cachePath(dir, tool, query);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
