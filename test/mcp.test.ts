import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { capVerbosity } from "../src/policy/verbosity";
import { cacheLookup, cacheLookupSubstring, cacheStore, mcpCacheKey } from "../src/cache/store";
import { MCP_TTL_MS, cacheQueryOf, isMcpTool, queryOf, mcpPreIntercept, mcpPostStore } from "../src/runtime/mcp";

const dir = (): string => mkdtempSync(join(tmpdir(), "fh-mcp-"));

test("capVerbosity caps exa numResults to 3, ignores context7", () => {
  expect(capVerbosity("mcp__exa__web_search_exa", { numResults: 10 })).toEqual({ numResults: 3 });
  expect(capVerbosity("mcp__exa__web_search_exa", { numResults: 2 })).toBeNull();
  expect(capVerbosity("mcp__context7__query-docs", { query: "x" })).toBeNull();
});

test("isMcpTool + queryOf", () => {
  expect(isMcpTool("mcp__context7__query-docs")).toBe(true);
  expect(isMcpTool("WebFetch")).toBe(true);
  expect(isMcpTool("Write")).toBe(false);
  expect(queryOf({ query: "react hooks" })).toBe("react hooks");
  expect(queryOf({ url: "https://x" })).toBe("https://x");
});

test("cache store/lookup round-trip + TTL + key stability", () => {
  const d = dir();
  expect(mcpCacheKey("t", "q")).toBe(mcpCacheKey("t", "q"));
  cacheStore(d, "mcp__exa__web_search_exa", "q1", "cached body");
  expect(cacheLookup(d, "mcp__exa__web_search_exa", "q1", 10_000, Date.now())).toBe("cached body");
  expect(cacheLookup(d, "mcp__exa__web_search_exa", "q1", -1, Date.now() + 5)).toBeNull();
  expect(cacheLookup(d, "mcp__exa__web_search_exa", "missing", 10_000, Date.now())).toBeNull();
});

test("mcpPreIntercept: cache hit denies with content; cap mutates", () => {
  const d = dir();
  const now = 1000;
  cacheStore(d, "mcp__exa__web_search_exa", "hit", "CACHED");
  const served = mcpPreIntercept("claude-code", "mcp__exa__web_search_exa", { query: "hit" }, d, 10_000, now);
  expect(served && JSON.parse(served.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
  expect(served?.docSource).toBe("exa");
  const mutated = mcpPreIntercept("gemini-cli", "mcp__exa__web_search_exa", { query: "miss", numResults: 9 }, d, 10_000, now);
  expect(mutated && JSON.parse(mutated.stdout).hookSpecificOutput.tool_input.numResults).toBe(3);
  expect(mutated?.docSource).toBeUndefined();
  expect(mcpPreIntercept("claude-code", "Write", {}, d, 10_000, now)).toBeNull();
});

test("mcpPostStore writes the compacted response with front-matter", () => {
  const d = dir();
  mcpPostStore("mcp__exa__web_search_exa", { query: "q2" }, [{ type: "text", text: "RESULT" }], d, 1000);
  const body = cacheLookup(d, "mcp__exa__web_search_exa", "q2", 10_000, Date.now());
  expect(body).toContain("RESULT");
  expect(body).toContain("query: \"q2\"");
});

test("cacheLookupSubstring: case-insensitive substring hit, miss otherwise", () => {
  const d = dir();
  mcpPostStore("mcp__exa__web_search_exa", { query: "React Server Components data fetching" }, [{ type: "text", text: "BODY" }], d, 1000);
  expect(cacheLookupSubstring(d, "react server components", 10_000, Date.now())).toContain("BODY");
  expect(cacheLookupSubstring(d, "totally unrelated query", 10_000, Date.now())).toBeNull();
});

test("mcpPreIntercept: MCP substring fallback serves a related cached query", () => {
  const d = dir();
  mcpPostStore("mcp__context7__query-docs", { query: "react hooks useeffect cleanup pattern" }, [{ type: "text", text: "DOCS" }], d, 1000);
  const served = mcpPreIntercept("claude-code", "mcp__context7__query-docs", { query: "react hooks useeffect" }, d, 10_000, Date.now());
  expect(served && JSON.parse(served.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
  expect(served?.docSource).toBe("context7");
});

test("WebFetch cache key folds prompt[:500] — distinct prompts never collide", () => {
  const d = dir();
  const url = "https://example.com";
  expect(cacheQueryOf("WebFetch", { url, prompt: "a" })).not.toBe(cacheQueryOf("WebFetch", { url, prompt: "b" }));
  mcpPostStore("WebFetch", { url, prompt: "summarize pricing" }, "PRICING", d, 1000);
  expect(mcpPreIntercept("claude-code", "WebFetch", { url, prompt: "list features" }, d, MCP_TTL_MS, 2000)).toBeNull();
  const hit = mcpPreIntercept("claude-code", "WebFetch", { url, prompt: "summarize pricing" }, d, MCP_TTL_MS, 2000);
  expect(hit && JSON.parse(hit.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
});

test("WebFetch TTL is 24h, overriding the 48h MCP window passed by the caller", () => {
  const d = dir();
  const url = "https://example.com/page";
  const now0 = Date.now();
  mcpPostStore("WebFetch", { url, prompt: "p" }, "BODY", d, now0);
  // Within 24h: fresh hit even though we pass MCP_TTL_MS.
  expect(mcpPreIntercept("claude-code", "WebFetch", { url, prompt: "p" }, d, MCP_TTL_MS, now0 + 1000)).not.toBeNull();
  // 25h later: stale for WebFetch (would still be fresh under the 48h MCP window).
  expect(mcpPreIntercept("claude-code", "WebFetch", { url, prompt: "p" }, d, MCP_TTL_MS, now0 + 25 * 3600_000)).toBeNull();
});
