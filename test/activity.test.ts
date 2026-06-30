import { test, expect } from "bun:test";
import { activityFor, type ToolEvent } from "../src/runtime/activity";
import { harnessStateDir } from "../src/runtime/storage";

const ev = (tool: string, input?: Record<string, unknown>): ToolEvent => ({ tool, input, sessionId: "s1", framework: "react", now: 1000 });

test("harnessStateDir: neutral .harness dir", () => {
  expect(harnessStateDir("/p")).toBe("/p/.harness");
});

test("activityFor: MCP doc credits BOTH doc and research-expert (parity: two hooks)", () => {
  expect(activityFor(ev("mcp__context7__query-docs"))).toEqual([
    { kind: "doc", framework: "react", sessionId: "s1", source: "context7" },
    { kind: "agent", name: "research-expert", ts: 1000 },
  ]);
  const exa = activityFor(ev("mcp_exa_web_search")).find((a) => a.kind === "doc");
  expect(exa && exa.kind === "doc" ? exa.source : null).toBe("exa");
});

test("activityFor: fuse-browser is the Exa fallback (doc only, not research)", () => {
  expect(activityFor(ev("mcp__fuse-browser__browser_fetch", { url: "https://x" }))).toEqual([
    { kind: "doc", framework: "react", sessionId: "s1", source: "fuse-browser" },
  ]);
});

test("activityFor: WebSearch credits BOTH doc and research-expert", () => {
  expect(activityFor(ev("WebSearch", { query: "x" }))).toEqual([
    { kind: "doc", framework: "react", sessionId: "s1", source: "websearch" },
    { kind: "agent", name: "research-expert", ts: 1000 },
  ]);
});

test("activityFor: agent spawn via Task subagent_type (bare name)", () => {
  expect(activityFor(ev("Task", { subagent_type: "fuse-ai-pilot:research-expert" }))).toEqual([{ kind: "agent", name: "research-expert", ts: 1000 }]);
  expect(activityFor(ev("Task", {}))).toEqual([]);
});

test("activityFor: ref read of a .md only", () => {
  expect(activityFor(ev("Read", { file_path: "/p/refs/srp.md" }))).toEqual([{ kind: "ref", path: "/p/refs/srp.md" }]);
  expect(activityFor(ev("read_file", { path: "/p/a.ts" }))).toEqual([]);
  expect(activityFor(ev("write_to_file", { path: "/p/a.ts" }))).toEqual([]);
});
