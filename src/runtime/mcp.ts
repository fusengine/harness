import { capVerbosity } from "../policy/verbosity";
import { cacheLookup, cacheStore } from "../cache/store";
import { extractText } from "../cache/mcp-response";

/** Default freshness for cached MCP/WebFetch results (48h). */
export const MCP_TTL_MS = 172_800_000;

/** MCP doc tools + WebFetch whose calls are cached / verbosity-capped. */
export function isMcpTool(tool: string): boolean {
  return /context7|exa|webfetch|web_fetch/i.test(tool) || tool === "WebFetch";
}

/** The query/url that keys the cache. */
export function queryOf(input: Record<string, unknown>): string {
  const q = input.query ?? input.url ?? input.libraryId ?? "";
  return typeof q === "string" ? q : JSON.stringify(q);
}

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
  const cached = cacheLookup(dir, tool, queryOf(input), ttlMs, now);
  if (cached) {
    const served = denyWith(id, cached);
    if (served) return { stdout: served, docSource: docSourceOf(tool) };
  }
  const capped = capVerbosity(tool, input);
  if (capped) {
    const mutated = mutateWith(id, capped);
    if (mutated) return { stdout: mutated };
  }
  return null;
}

/** Post-event: store the MCP/WebFetch response (extracted to markdown) in the cache. */
export function mcpPostStore(tool: string, input: Record<string, unknown>, response: unknown, dir: string): void {
  if (!isMcpTool(tool)) return;
  cacheStore(dir, tool, queryOf(input), extractText(response));
}
