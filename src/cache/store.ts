import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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

/** Read a cached entry if it exists and is fresh (mtime within `ttlMs`), else null. */
export function cacheLookup(dir: string, tool: string, query: string, ttlMs: number, now: number): string | null {
  const path = cachePath(dir, tool, query);
  try {
    if (!existsSync(path) || now - statSync(path).mtimeMs > ttlMs) return null;
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** Store a cache entry (creates the dir; no-op on empty content). */
export function cacheStore(dir: string, tool: string, query: string, content: string): void {
  if (!content) return;
  const path = cachePath(dir, tool, query);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
