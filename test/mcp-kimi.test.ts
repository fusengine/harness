import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { cacheStore } from "../src/cache/store";
import { mcpPreIntercept, mcpPostStore } from "../src/runtime/mcp";

// Kimi MCP verdicts: the cache-hit deny rides Kimi's documented envelope
// (adapters/kimi/kimiDenyResponse); input mutation has no Kimi contract, so
// the exa verbosity cap stays inoperative (mcp.ts mutateWith comment).
const dir = (): string => mkdtempSync(join(tmpdir(), "fh-mcp-kimi-"));

test("mcpPreIntercept kimi: cache hit denies via the native envelope (no hookEventName)", () => {
  const d = dir();
  cacheStore(d, "mcp__exa__web_search_exa", "hit", "CACHED");
  const served = mcpPreIntercept("kimi", "mcp__exa__web_search_exa", { query: "hit" }, d, 10_000, 1000);
  expect(served).not.toBeNull();
  const out = JSON.parse(served!.stdout);
  expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
  expect(out.hookSpecificOutput.permissionDecisionReason).toContain("CACHED");
  expect(out.hookSpecificOutput.hookEventName).toBeUndefined();
  expect(served?.docSource).toBe("exa");
});

test("mcpPreIntercept kimi: cache miss allows; the verbosity cap cannot mutate (null)", () => {
  const d = dir();
  expect(mcpPreIntercept("kimi", "mcp__exa__web_search_exa", { query: "miss", numResults: 9 }, d, 10_000, 1000)).toBeNull();
  expect(mcpPreIntercept("kimi", "Write", {}, d, 10_000, 1000)).toBeNull();
});

test("mcpPreIntercept kimi: WebFetch cache hit denies with the web notice", () => {
  const d = dir();
  const url = "https://example.com";
  mcpPostStore("FetchURL", { url, prompt: "p" }, "BODY", d, 1000);
  const hit = mcpPreIntercept("kimi", "FetchURL", { url, prompt: "p" }, d, 10_000, 2000);
  expect(hit && JSON.parse(hit.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
});
