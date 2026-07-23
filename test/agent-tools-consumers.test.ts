import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { AGENT_TOOLS } from "../src/runtime/is-agent-tool";
import { classifyAgentEvidence } from "../src/freshness/agent-evidence-record";
import { activityFor } from "../src/runtime/activity";

/**
 * Lock the single-definition invariant for sub-agent dispatch tools: BOTH
 * consumers must behave off the canonical {@link AGENT_TOOLS} set — for EVERY
 * name in it, unconditionally (no existence guard). If either consumer ever
 * re-declares its own list, this test fails.
 */
test("agent-evidence-record: every AGENT_TOOLS name is excluded from evidence credit", () => {
  for (const tool of AGENT_TOOLS) {
    expect(classifyAgentEvidence(tool, { prompt: "x" }, { result: "y".repeat(100) })).toBeNull();
  }
  expect(classifyAgentEvidence("Write", {}, undefined)).toBeNull(); // negative: not a launch tool
});

test("activity: every AGENT_TOOLS name takes the agent-tracking branch", () => {
  for (const tool of AGENT_TOOLS) {
    const acts = activityFor({ tool, input: { subagent_type: "fuse:explore" }, sessionId: "s", framework: "generic", now: 1 });
    expect(acts.some((a) => a.kind === "agent" && a.name === "explore")).toBe(true);
  }
  const plain = activityFor({ tool: "Write", input: {}, sessionId: "s", framework: "generic", now: 1 });
  expect(plain.some((a) => a.kind === "agent")).toBe(false); // negative: no agent branch
});

test("wiring: both consumers import the canonical module (no local re-declaration)", () => {
  const evidence = readFileSync(new URL("../src/freshness/agent-evidence-record.ts", import.meta.url), "utf8");
  const activity = readFileSync(new URL("../src/runtime/activity.ts", import.meta.url), "utf8");
  const transcript = readFileSync(new URL("../src/freshness/agent-evidence.ts", import.meta.url), "utf8");
  expect(evidence).toContain('from "../runtime/is-agent-tool"');
  expect(activity).toContain('from "./is-agent-tool"');
  expect(transcript).toContain('from "../runtime/is-agent-tool"');
  expect(evidence).not.toContain('"AgentSwarm"');
  expect(activity).not.toContain('"AgentSwarm"');
  expect(transcript).not.toContain('=== "Task" || ');
});
