import { test, expect } from "bun:test";
import { isAgentTool } from "../src/runtime/is-agent-tool";

test("isAgentTool: Task (claude-code/codex), Agent + AgentSwarm (kimi) are dispatch tools", () => {
  expect(isAgentTool("Task")).toBe(true);
  expect(isAgentTool("Agent")).toBe(true);
  expect(isAgentTool("AgentSwarm")).toBe(true);
});

test("isAgentTool: ordinary tools and near-misses are not dispatch tools", () => {
  expect(isAgentTool("Bash")).toBe(false);
  expect(isAgentTool("Write")).toBe(false);
  expect(isAgentTool("task")).toBe(false);
  expect(isAgentTool("agent")).toBe(false);
  expect(isAgentTool("")).toBe(false);
});

// Deliberate, verified 2026-07: codex `spawn_agent` (multi_agent_v2) is NOT a
// dispatch name here — its evidence is owned by the dedicated PostToolUse
// bridge (freshness/codex-spawn-evidence.ts), the explore tables never match
// it, and its `agent_type` field would starve activity.ts's subagent_type
// extraction. Adding it would double-credit track.agents.
test("isAgentTool: codex spawn_agent stays OUT (evidence bridge owns it)", () => {
  expect(isAgentTool("spawn_agent")).toBe(false);
  expect(isAgentTool("fusengine_agentsspawn_agent")).toBe(false);
});
