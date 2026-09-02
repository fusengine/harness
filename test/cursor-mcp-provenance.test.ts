import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheLookup } from "../src/cache/store";
import { projectLayout } from "../src/config/layout";
import { handleHook } from "../src/runtime/handle";
import { normalizeEvent } from "../src/runtime/normalize";
import { defaultStateDir, trackFile } from "../src/runtime/paths";
import { loadTrack } from "../src/tracking/store";
import { isDocConsulted } from "../src/freshness/doc-helpers";

test("Cursor MCP string input merges only authoritative root provenance and result fields", () => {
  const payload = {
    hook_event_name: "beforeMCPExecution",
    tool_name: "run_command",
    tool_input: JSON.stringify({ command: "nested command", query: "docs", url: "nested-url" }),
    command: "transport command",
    mcp_server_name: "context7",
    mcp_server_url: "https://mcp.example.test",
    url: "https://authoritative.example.test",
    result_json: '{"content":"result"}',
    duration: 42,
    ignored_root: "must not merge",
  };
  const event = normalizeEvent("cursor", payload);
  expect(event.input).toMatchObject({
    command: "nested command",
    query: "docs",
    mcp_server_name: "context7",
    mcp_server_url: "https://mcp.example.test",
    url: "https://authoritative.example.test",
    result_json: '{"content":"result"}',
    duration: 42,
  });
  expect(event.input.ignored_root).toBeUndefined();
  expect([event.command, event.commandCandidates]).toEqual([
    "transport command",
    ["transport command", "nested command"],
  ]);
});

test("Cursor afterMCPExecution qualifies the tool and caches root result_json", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-mcp-cache-"));
  const tool = "mcp__context7__query-docs";
  const payload = {
    hook_event_name: "afterMCPExecution",
    session_id: "cursor-mcp-post",
    tool_name: "query-docs",
    tool_input: JSON.stringify({ query: "react hooks" }),
    mcp_server_name: "context7",
    result_json: JSON.stringify([{ type: "text", text: "CURSOR MCP RESULT" }]),
    duration: 12,
  };
  expect(normalizeEvent("cursor", payload).tool).toBe(tool);
  expect(await handleHook("cursor", payload, { cwd, now: Date.now() })).toEqual({ stdout: "{}", exit: 0 });
  expect(cacheLookup(projectLayout(cwd).cacheDir, tool, "react hooks", 10_000, Date.now()))
    .toContain("CURSOR MCP RESULT");

  const control = {
    hook_event_name: "postToolUse",
    session_id: "cursor-mcp-control",
    tool_name: tool,
    tool_input: { query: "control query" },
    tool_output: [{ type: "text", text: "CONTROL RESULT" }],
  };
  await handleHook("cursor", control, { cwd, now: Date.now() });
  expect(cacheLookup(projectLayout(cwd).cacheDir, tool, "control query", 10_000, Date.now()))
    .toContain("CONTROL RESULT");
});

/**
 * B2 decision (coordinator-confirmed): Cursor's `MCP:<tool>` form (preToolUse/
 * postToolUse/postToolUseFailure — server name lost per Cursor CLI 3.18.25
 * ground truth) reconstructs the real server for the closed, gate-critical
 * table in normalize.ts (`CURSOR_MCP_TOOL_SERVERS`). A tool OUTSIDE that
 * table keeps its raw `MCP:<tool>` name unchanged — NO `mcp__cursor__<tool>`
 * placeholder is fabricated (locked by `test/cursor-followup-normalize.test.ts`'s
 * pre-existing "commandless MCP tools keep their name" contract).
 */
test("Cursor MCP: bare-tool canonicalization: closed-table servers, fuse-browser prefix rule, unknown tool stays raw", () => {
  expect(normalizeEvent("cursor", { hook_event_name: "preToolUse", tool_name: "MCP:query-docs", tool_input: {} }).tool)
    .toBe("mcp__context7__query-docs");
  expect(normalizeEvent("cursor", { hook_event_name: "postToolUse", tool_name: "MCP:web_search_exa", tool_input: {} }).tool)
    .toBe("mcp__exa__web_search_exa");
  expect(normalizeEvent("cursor", { hook_event_name: "postToolUseFailure", tool_name: "MCP:browser_screenshot", tool_input: {} }).tool)
    .toBe("mcp__fuse-browser__browser_screenshot");
  expect(normalizeEvent("cursor", { hook_event_name: "preToolUse", tool_name: "MCP:some_unlisted_tool", tool_input: {} }).tool)
    .toBe("MCP:some_unlisted_tool");
});

/**
 * Real consumer #1: `docSourceOf` (src/runtime/activity.ts), wired through
 * `handlePost` -> `activityFor` -> `recordActivity` into the session track,
 * then read back by the freshness gate's `isDocConsulted` — for BOTH the
 * context7 and exa servers reconstructed from Cursor's bare `MCP:<tool>`
 * form. Before B2, `event.tool` stayed `"MCP:query-docs"`/`"MCP:web_search_exa"`
 * and `docSourceOf` never recognized either.
 */
test("Cursor postToolUse MCP: bare tools credit doc consultation for context7 AND exa (activity.ts docSourceOf, real consumer)", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-mcp-docsource-"));
  const sessionId = "cursor-mcp-docsource";
  await handleHook("cursor", {
    hook_event_name: "postToolUse",
    session_id: sessionId,
    tool_name: "MCP:query-docs",
    tool_input: { libraryId: "/facebook/react", query: "hooks" },
  }, { cwd, now: 1 });
  await handleHook("cursor", {
    hook_event_name: "postToolUse",
    session_id: sessionId,
    tool_name: "MCP:web_search_exa",
    tool_input: { query: "react hooks" },
  }, { cwd, now: 2 });

  const track = await loadTrack(trackFile(sessionId, defaultStateDir(cwd)));
  expect(isDocConsulted(track.authorizations, sessionId)).toBe(true);
});
