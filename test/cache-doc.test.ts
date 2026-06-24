import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleHook } from "../src/runtime/handle";
import { projectLayout } from "../src/config/layout";
import { trackFile } from "../src/runtime/paths";
import { cacheStore } from "../src/cache/store";
import { loadTrack } from "../src/tracking/store";
import { isDocConsulted } from "../src/freshness/doc-helpers";

test("a served MCP cache-hit records doc consultation (Context7 + Exa)", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "fh-cd-"));
  const layout = projectLayout(cwd);
  cacheStore(layout.cacheDir, "mcp__context7__query-docs", "react", "DOCS");
  cacheStore(layout.cacheDir, "mcp__exa__web_search_exa", "react hooks", "DOCS");

  await handleHook("claude-code", { session_id: "s1", hook_event_name: "PreToolUse", tool_name: "mcp__context7__query-docs", tool_input: { query: "react" } }, { now: 1, cwd });
  await handleHook("claude-code", { session_id: "s1", hook_event_name: "PreToolUse", tool_name: "mcp__exa__web_search_exa", tool_input: { query: "react hooks" } }, { now: 2, cwd });

  const track = await loadTrack(trackFile("s1", layout.trackDir));
  expect(isDocConsulted(track.authorizations, "s1")).toBe(true);
});
