import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheLookup } from "../src/cache/store";
import { projectLayout } from "../src/config/layout";
import { handleHook } from "../src/runtime/handle";
import { normalizeEvent } from "../src/runtime/normalize";

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
