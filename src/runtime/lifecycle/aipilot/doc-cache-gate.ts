/**
 * @module aipilot/doc-cache-gate
 * PreToolUse gate for the ai-pilot scope: DENY a Context7/Exa doc call when the
 * per-project doc cache already holds that library fresh (< 7d). Ports the
 * source `doc-cache-gate.ts`. The inject side (`inject-doc.ts`) serves the same
 * cache on SubagentStart; this side avoids the redundant live re-query.
 * @packageDocumentation
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readJsonFile } from "../../../util/json-io";
import { pathExists } from "../../../util/runtime-io";
import { denyResponse } from "../../../adapters/claude";
import { cacheDirFor, cacheAge, projectHash, DOC_CACHE_TTL_SECONDS } from "./cache-base";
import { logCacheEvent } from "./analytics";
import type { CacheIndex } from "./types";

const GATED_TOOLS = /context7__query-docs|exa__get_code_context|exa__web_search/;

/** The library key a gated tool call targets (Context7 libraryId / Exa query), or "". */
function libraryOf(payload: Record<string, unknown>): string {
  const tool = String(payload.tool_name ?? "");
  const input = (payload.tool_input as Record<string, unknown> | undefined) ?? {};
  if (tool.includes("context7")) {
    // Real mcp__context7__query-docs input is {libraryId, query} — no "topic"
    // field exists (confirmed against cache-doc.ts and mcp-key.ts's queryOf,
    // which both key on `query`, never `topic`).
    const libraryId = typeof input.libraryId === "string" ? input.libraryId : "";
    const query = typeof input.query === "string" ? input.query : "";
    return libraryId && query ? libraryId : "";
  }
  if (tool.includes("exa")) return typeof input.query === "string" ? input.query : "";
  return "";
}

/**
 * DENY a redundant doc call when the library is cached fresh, else `null`.
 * @param payload - The raw PreToolUse hook payload.
 * @param cwd - Fallback project root (uses `CLAUDE_PROJECT_DIR` first).
 * @param now - Clock (defaults to `Date.now()`).
 * @param home - Home dir (defaults to `~`).
 * @returns A native deny response, or `null` to fall through to the live call.
 */
export async function docCacheGate(payload: Record<string, unknown>, cwd: string, now: number = Date.now(), home: string = homedir()): Promise<string | null> {
  const tool = String(payload.tool_name ?? "");
  if (!GATED_TOOLS.test(tool)) return null;
  const library = libraryOf(payload);
  if (!library) return null;

  const projPath = process.env.CLAUDE_PROJECT_DIR ?? cwd;
  const cacheDir = cacheDirFor("doc", projPath, home);
  const index = await readJsonFile<CacheIndex>(join(cacheDir, "index.json"));
  const entry = index?.docs?.find((d) => d.library === library);
  if (!entry?.hash || !entry.timestamp) return null;

  const docFile = join(cacheDir, "docs", `${entry.hash}.md`);
  if (!pathExists(docFile)) return null;
  const age = cacheAge(entry.timestamp, now);
  if (age >= DOC_CACHE_TTL_SECONDS) return null;

  logCacheEvent("doc", "blocked", projectHash(projPath), { library }, home);
  const ageH = Math.floor(age / 3600);
  return denyResponse("PreToolUse", `Doc already cached at ${docFile} (age: ${ageH}h). Use the Read tool to access it instead of re-querying.`);
}
