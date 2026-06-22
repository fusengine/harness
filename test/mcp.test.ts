import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { capVerbosity } from "../src/policy/verbosity";
import { cacheLookup, cacheStore, mcpCacheKey } from "../src/cache/store";
import { isMcpTool, queryOf, mcpPreIntercept, mcpPostStore } from "../src/runtime/mcp";

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
  expect(served && JSON.parse(served).hookSpecificOutput.permissionDecision).toBe("deny");
  const mutated = mcpPreIntercept("gemini-cli", "mcp__exa__web_search_exa", { query: "miss", numResults: 9 }, d, 10_000, now);
  expect(mutated && JSON.parse(mutated).hookSpecificOutput.tool_input.numResults).toBe(3);
  expect(mcpPreIntercept("claude-code", "Write", {}, d, 10_000, now)).toBeNull();
});

test("mcpPostStore writes the extracted response", () => {
  const d = dir();
  mcpPostStore("mcp__exa__web_search_exa", { query: "q2" }, [{ type: "text", text: "RESULT" }], d);
  expect(cacheLookup(d, "mcp__exa__web_search_exa", "q2", 10_000, Date.now())).toBe("RESULT");
});
