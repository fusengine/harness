/**
 * Kimi Code delegation credit — unit level (activityFor / classifyAgentEvidence).
 * `AgentSwarm` is Kimi's batch sub-agent launcher (prompt_template + items,
 * one subagent_type applied to every spawned sub-agent) — verifies it is
 * classified exactly like Task/Agent, never double-counted as exploration.
 */
import { test, expect } from "bun:test";
import { activityFor, type ToolEvent } from "../src/runtime/activity";
import { classifyAgentEvidence } from "../src/freshness/agent-evidence-record";

test("activityFor: AgentSwarm launch is classified exactly like Task/Agent (name from subagent_type, quality from responseLength)", () => {
  const ev = (input: Record<string, unknown>, responseLength?: number): ToolEvent => ({
    tool: "AgentSwarm", input, sessionId: "s1", framework: "generic", now: 1000, responseLength,
  });
  expect(activityFor(ev({ subagent_type: "coder" }, 800))).toEqual([{ kind: "agent", name: "coder", ts: 1000, quality: "sufficient" }]);
  expect(activityFor(ev({ subagent_type: "coder" }, 10))).toEqual([{ kind: "agent", name: "coder", ts: 1000, quality: "insufficient" }]);
  expect(activityFor(ev({}))).toEqual([]);
});

test("classifyAgentEvidence: AgentSwarm is a launch tool, excluded like Task/Agent (anti-double-count)", () => {
  expect(classifyAgentEvidence("AgentSwarm", { subagent_type: "coder" }, "x".repeat(800))).toBeNull();
});
