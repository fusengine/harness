/**
 * Shared cache-path + age helpers for the ai-pilot scope.
 * Reuses the harness home-state (`fusengineCache`) so the ai-pilot caches live
 * under the same `~/.fuse-harness/cache` tree as the core MCP cache — no
 * second cache layer.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import { fusengineCache } from "../../home-state";
import { readText } from "../../../util/runtime-io";

/** Doc cache freshness window, in seconds (7 days) — shared by inject-doc.ts (serves the cache) and doc-cache-gate.ts (denies a redundant re-query). */
export const DOC_CACHE_TTL_SECONDS = 604_800;

/** 16-char hex SHA-256 of `text` (project hash / doc topic key). */
export function hashText16(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** 16-char project hash from its absolute path. */
export function projectHash(projectPath: string): string {
  return hashText16(projectPath);
}

/** `~/.fuse-harness/cache` base dir (shared with the core MCP cache). */
export function cacheBaseDir(home: string = homedir()): string {
  return fusengineCache(home);
}

/** Per-type, per-project cache dir: `cache/<type>/<projectHash>`. */
export function cacheDirFor(type: string, projectPath: string, home: string = homedir()): string {
  return join(cacheBaseDir(home), type, projectHash(projectPath));
}

/** Age in seconds from an ISO timestamp (now - ts). */
export function cacheAge(ts: string, now: number = Date.now()): number {
  return Math.floor((now - new Date(ts).getTime()) / 1000);
}

/** Full SHA-256 hex checksum of a file's text; "" when unreadable. */
export async function fileChecksum(path: string): Promise<string> {
  try {
    return createHash("sha256").update(readText(path)).digest("hex");
  } catch {
    return "";
  }
}
