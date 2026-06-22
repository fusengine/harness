import { test, expect } from "bun:test";
import { activityFor, type ToolEvent } from "../src/runtime/activity";
import { harnessTrackDir } from "../src/runtime/storage";

const ev = (tool: string, input?: Record<string, unknown>): ToolEvent => ({ tool, input, sessionId: "s1", framework: "react", now: 1000 });

test("harnessTrackDir: per-harness config dir + fallback", () => {
  expect(harnessTrackDir("claude-code", "/p")).toBe("/p/.claude/harness");
  expect(harnessTrackDir("codex", "/p")).toBe("/p/.codex/harness");
  expect(harnessTrackDir("gemini-cli", "/p")).toBe("/p/.gemini/harness");
  expect(harnessTrackDir("aider", "/p")).toBe("/p/.fuse-harness/harness");
});

test("activityFor: MCP doc (any separator)", () => {
  expect(activityFor(ev("mcp__context7__query-docs"))).toEqual({ kind: "doc", framework: "react", sessionId: "s1", source: "context7" });
  const exa = activityFor(ev("mcp_exa_web_search"));
  expect(exa && exa.kind === "doc" ? exa.source : null).toBe("exa");
});

test("activityFor: agent spawn via Task subagent_type (bare name)", () => {
  expect(activityFor(ev("Task", { subagent_type: "fuse-ai-pilot:research-expert" }))).toEqual({ kind: "agent", name: "research-expert", ts: 1000 });
  expect(activityFor(ev("Task", {}))).toBeNull();
});

test("activityFor: ref read of a .md only", () => {
  expect(activityFor(ev("Read", { file_path: "/p/refs/srp.md" }))).toEqual({ kind: "ref", path: "/p/refs/srp.md" });
  expect(activityFor(ev("read_file", { path: "/p/a.ts" }))).toBeNull();
  expect(activityFor(ev("write_to_file", { path: "/p/a.ts" }))).toBeNull();
});
