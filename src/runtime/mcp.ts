import { capVerbosity } from "../policy/verbosity";
import { cacheLookupMeta, cacheLookupSubstringMeta, type CacheHit } from "../cache/store";
import { extractText } from "../cache/mcp-response";
import { mcpCacheWrite, webfetchCacheWrite } from "../cache/mcp-store";
import { WEBFETCH_TTL_MS, cacheQueryOf, isMcpTool, isWebFetch } from "./mcp-key";

export { MCP_TTL_MS, WEBFETCH_TTL_MS, cacheQueryOf, isMcpTool, queryOf } from "./mcp-key";

function denyWith(id: string, content: string): string {
  if (id === "claude-code" || id === "codex") {
    return JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: content } });
  }
  if (id === "gemini-cli") return JSON.stringify({ decision: "deny", reason: content });
  return "";
}

function mutateWith(id: string, input: Record<string, unknown>): string {
  if (id === "claude-code" || id === "codex") {
    return JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: input } });
  }
  if (id === "gemini-cli") return JSON.stringify({ hookSpecificOutput: { tool_input: input } });
  return "";
}

/** The doc provider a served cache-hit satisfies (`exa`/`context7`), else undefined. */
function docSourceOf(tool: string): string | undefined {
  if (/exa/i.test(tool)) return "exa";
  if (/context7/i.test(tool)) return "context7";
  return undefined;
}

/**
 * Wrap a cache hit's body in the harness-facing `CACHE HIT` notice — parity with
 * `webfetch-cache-lookup.py` / `mcp-cache-lookup.py` (KB = body chars/1024 + 1,
 * age hours = ageMs/3_600_000, both floored).
 */
function cacheHitText(web: boolean, hit: CacheHit): string {
  const kb = Math.floor(hit.body.length / 1024) + 1;
  const hours = Math.floor(hit.ageMs / 3_600_000);
  return web
    ? `CACHE HIT WebFetch (~${kb}KB economise, cached il y a ${hours}h):\n\n${hit.body}\n\nPour forcer un nouveau fetch, modifie l'URL ou la query.`
    : `CACHE HIT (~${kb}KB economise, cached il y a ${hours}h): ${hit.body}\n\nReformule pour forcer un re-call.`;
}

/** A pre-event MCP interception: the native response + any doc source it satisfied. */
export interface McpIntercept {
  stdout: string;
  docSource?: string;
}

/**
 * Pre-event MCP interception: serve a fresh cache hit (deny + cached content),
 * else cap exa verbosity (allow + mutated input), else null to allow normally.
 * Harnesses without input-mutation/cache support fall through to null.
 */
export function mcpPreIntercept(id: string, tool: string, input: Record<string, unknown>, dir: string, ttlMs: number, now: number): McpIntercept | null {
  if (!isMcpTool(tool)) return null;
  const web = isWebFetch(tool);
  const ttl = web ? WEBFETCH_TTL_MS : ttlMs;
  const key = cacheQueryOf(tool, input);
  // Exact key first; for MCP docs fall back to a substring hit (Python `rg -i -F`).
  const hit = cacheLookupMeta(dir, tool, key, ttl, now) ?? (web ? null : cacheLookupSubstringMeta(dir, key, ttl, now));
  if (hit) {
    const served = denyWith(id, cacheHitText(web, hit));
    if (served) return { stdout: served, docSource: docSourceOf(tool) };
  }
  const capped = capVerbosity(tool, input);
  if (capped) {
    const mutated = mutateWith(id, capped);
    if (mutated) return { stdout: mutated };
  }
  return null;
}

/**
 * Post-event: persist the MCP/WebFetch response (extracted to markdown). MCP docs
 * go through {@link mcpCacheWrite} (compact + Jaccard-dedup + `index.json`);
 * WebFetch uses {@link webfetchCacheWrite} (compact, exact key, no index).
 * @param now - Current epoch ms (timestamp source; defaults to `Date.now()`).
 */
export function mcpPostStore(tool: string, input: Record<string, unknown>, response: unknown, dir: string, now: number = Date.now()): void {
  if (!isMcpTool(tool)) return;
  const text = extractText(response);
  const key = cacheQueryOf(tool, input);
  if (isWebFetch(tool)) webfetchCacheWrite(dir, tool, key, text, now);
  else mcpCacheWrite(dir, tool, key, text, now);
}
