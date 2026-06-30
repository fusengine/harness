import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { activityFor, type ToolEvent } from "../src/runtime/activity";
import { agentsRanFromTranscript } from "../src/freshness/agent-evidence";
import { saveSessionState } from "../src/runtime/home-state";
import { trackAgentMemory } from "../src/runtime/lifecycle/agent-memory";
import { validateTeammateOutput } from "../src/runtime/lifecycle/teammate-idle";

const ev = (tool: string, input?: Record<string, unknown>, responseLength?: number): ToolEvent =>
  ({ tool, input, sessionId: "s1", framework: "react", now: 1000, responseLength });

// #6 — activity.ts: Agent tool + direct exploration/research crediting.

test("activityFor: Agent tool credits bare agent name (prefix stripped)", () => {
  expect(activityFor(ev("Agent", { subagent_type: "fuse-ai-pilot:explore-codebase" }))).toEqual([{ kind: "agent", name: "explore-codebase", ts: 1000 }]);
});

test("activityFor: direct exploration credited as explore-codebase", () => {
  expect(activityFor(ev("Glob", { pattern: "**/*.ts" }))).toEqual([{ kind: "agent", name: "explore-codebase", ts: 1000 }]);
  expect(activityFor(ev("Bash", { command: "FOO=1 grep -r x src" }))).toEqual([{ kind: "agent", name: "explore-codebase", ts: 1000 }]);
  // `cd`-prefixed Bash has executable `cd` → not exploration.
  expect(activityFor(ev("Bash", { command: "cd /x && echo hi" }))).toEqual([]);
});

test("activityFor: web credits doc + research-expert; MCP cache read credits research", () => {
  expect(activityFor(ev("WebSearch", { query: "x" }))).toEqual([
    { kind: "doc", framework: "react", sessionId: "s1", source: "websearch" },
    { kind: "agent", name: "research-expert", ts: 1000 },
  ]);
  expect(activityFor(ev("Read", { file_path: "/x/context/mcp/exa-search-abc.md" }, 10))).toEqual([{ kind: "agent", name: "research-expert", ts: 1000, quality: "sufficient" }]);
  // A plain .md read remains a ref, not research.
  expect(activityFor(ev("Read", { file_path: "/p/refs/srp.md" }))).toEqual([{ kind: "ref", path: "/p/refs/srp.md" }]);
});

// #6 — agent-evidence.ts: transcript accepts Agent + strips plugin prefix.

test("agentsRanFromTranscript: accepts Agent tool + strips plugin prefix", () => {
  const dir = mkdtempSync(join(tmpdir(), "fh-tr2-"));
  const now = 1_000_000;
  const line = JSON.stringify({
    timestamp: new Date(now).toISOString(),
    message: { content: [{ type: "tool_use", name: "Agent", input: { subagent_type: "fuse-ai-pilot:research-expert" } }] },
  });
  const file = join(dir, "t.jsonl");
  writeFileSync(file, line + "\n");
  expect(agentsRanFromTranscript(file, ["research-expert"], 120_000, now)).toBe(true);
});

// #16c — readers consume unified session state `.changes` (written by track-changes).

test("lifecycle readers consume unified state .changes", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-home-"));
  const sid = "sess1";
  saveSessionState(sid, { changes: { cumulativeCodeFiles: 2, modifiedFiles: ["a.ts", "b.ts"] } }, home);
  expect(validateTeammateOutput({ teammate_name: "tm", session_id: sid }, home)).toContain("modifying 2 code file(s): a.ts, b.ts");
  expect(trackAgentMemory({ agent_type: "react-expert", session_id: sid }, home, 1000)).toContain("modified 2 code file(s): a.ts, b.ts");
  // agent-memory resets the counter → a second stop sees no changes.
  expect(trackAgentMemory({ agent_type: "react-expert", session_id: sid }, home, 1000)).toContain("no code changes");
});

test("lifecycle readers stay quiet without recorded changes", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-home2-"));
  expect(validateTeammateOutput({ teammate_name: "tm", session_id: "x" }, home)).toBe("");
  expect(trackAgentMemory({ agent_type: "react-expert", session_id: "x" }, home, 1000)).toContain("no code changes");
});
