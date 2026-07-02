import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentsFreshInTrack, classifyAgentEvidence, recordAgentEvidence } from "../src/freshness/agent-evidence-record";
import { emptyTrack, recordAgent } from "../src/tracking/session-state";
import { loadTrack } from "../src/tracking/store";
import { apexScopedGate } from "../src/runtime/gate-apex";
import type { GateInput } from "../src/runtime/gate-input";

const NOW = 1_000_000;
const WINDOW = 120_000;
const bigResponse = { output: "x".repeat(100) }; // JSON.stringify > 50 chars
const tinyResponse = { ok: true }; // JSON.stringify <= 50 chars

test("classifyAgentEvidence: explore/research/cache-read classification (parity _classify)", () => {
  expect(classifyAgentEvidence("Glob", { pattern: "**/*.ts" }, bigResponse)).toEqual({ name: "subagent-explore-codebase", quality: "sufficient" });
  expect(classifyAgentEvidence("Bash", { command: "rg -n foo src" }, bigResponse)).toEqual({ name: "subagent-explore-codebase", quality: "sufficient" });
  expect(classifyAgentEvidence("mcp__exa__web_search_exa", { query: "q" }, bigResponse)).toEqual({ name: "subagent-research-expert", quality: "sufficient" });
  // A cached-MCP Read is sufficient even with a tiny response (cacheHit).
  expect(classifyAgentEvidence("Read", { file_path: "/x/context/mcp/context7-react.md" }, tinyResponse)).toEqual({ name: "subagent-research-expert", quality: "sufficient" });
  expect(classifyAgentEvidence("Read", { file_path: "/repo/.harness/cache/0011aabb.md" }, tinyResponse)).toEqual({ name: "subagent-research-expert", quality: "sufficient" });
  expect(classifyAgentEvidence("Edit", { file_path: "/a.ts" }, bigResponse)).toBeNull();
});

test("classifyAgentEvidence: tool_response is an OBJECT — JSON length drives quality", () => {
  expect(classifyAgentEvidence("Grep", { pattern: "x" }, tinyResponse)?.quality).toBe("insufficient");
  expect(classifyAgentEvidence("Grep", { pattern: "x" }, undefined)?.quality).toBe("insufficient");
  expect(classifyAgentEvidence("Grep", { pattern: "x" }, bigResponse)?.quality).toBe("sufficient");
});

test("classifyAgentEvidence: Task/Agent launches skipped (anti-double-count: Task tracking credits them)", () => {
  expect(classifyAgentEvidence("Task", { subagent_type: "research-expert" }, bigResponse)).toBeNull();
  expect(classifyAgentEvidence("Agent", { name: "explore-codebase" }, bigResponse)).toBeNull();
});

test("recordAgentEvidence: persists into the session track; agent_id is metadata only, never a condition", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "fh-ev-")), "track.json");
  await recordAgentEvidence(file, { name: "subagent-research-expert", quality: "sufficient" }, NOW, "agent-123");
  await recordAgentEvidence(file, { name: "subagent-explore-codebase", quality: "sufficient" }, NOW); // no agent_id → still recorded (gh#22348)
  const t = await loadTrack(file);
  expect(t.agents.map((a) => a.name)).toEqual(["subagent-research-expert", "subagent-explore-codebase"]);
  expect(t.agents[0]?.ts).toBe(NOW);
  expect((t.agents[0] as { agentId?: string } | undefined)?.agentId).toBe("agent-123");
  expect((t.agents[1] as { agentId?: string } | undefined)?.agentId).toBeUndefined();
});

test("agentsFreshInTrack: substring match — subagent-research-expert satisfies research-expert", () => {
  let t = recordAgent(emptyTrack(), "subagent-research-expert", NOW - 1000, "sufficient");
  t = recordAgent(t, "subagent-explore-codebase", NOW - 500, "sufficient");
  expect(agentsFreshInTrack(t, ["research-expert"], WINDOW, NOW)).toBe(true);
  expect(agentsFreshInTrack(t, ["explore-codebase", "research-expert"], WINDOW, NOW)).toBe(true);
});

test("agentsFreshInTrack: stale entry no longer counts (reverse scan stops at first stale)", () => {
  const t = recordAgent(emptyTrack(), "subagent-research-expert", NOW - WINDOW - 1, "sufficient");
  expect(agentsFreshInTrack(t, ["research-expert"], WINDOW, NOW)).toBe(false);
});

test("agentsFreshInTrack: insufficient (or ungraded) quality never counts (parity _scan_agents)", () => {
  let t = recordAgent(emptyTrack(), "subagent-research-expert", NOW - 100, "insufficient");
  expect(agentsFreshInTrack(t, ["research-expert"], WINDOW, NOW)).toBe(false);
  t = recordAgent(emptyTrack(), "subagent-research-expert", NOW - 100); // no quality → insufficient default
  expect(agentsFreshInTrack(t, ["research-expert"], WINDOW, NOW)).toBe(false);
});

/** A transcript whose only tool_use is an Edit — NO explore/research evidence (a blind lead transcript). */
function blindTranscript(): string {
  const line = JSON.stringify({ timestamp: new Date(NOW).toISOString(), message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "/x.ts" } }] } });
  const file = join(mkdtempSync(join(tmpdir(), "fh-ev-tr-")), "t.jsonl");
  writeFileSync(file, line + "\n");
  return file;
}

const gateInput = (): GateInput => ({
  sessionId: "s1", framework: "react", tool: "Write", filePath: "/proj/src/a.tsx",
  content: "export const A = 1;\n", now: NOW, windowMs: WINDOW,
  trackFile: join(mkdtempSync(join(tmpdir(), "fh-ev-gate-")), "track.json"), transcriptPath: blindTranscript(),
});

test("gate: fresh sub-agent track evidence unblocks freshness even when the LEAD transcript is blind", async () => {
  let t = recordAgent(emptyTrack(), "subagent-explore-codebase", NOW - 1000, "sufficient");
  t = recordAgent(t, "subagent-research-expert", NOW - 1000, "sufficient");
  const prompt = await apexScopedGate(gateInput(), t, WINDOW);
  // Freshness passed via the session track; the NEXT gate (doc consultation) is the one that blocks.
  // Deny title is now framework-specific (parity enforce-apex-phases.ts Check-1 message).
  expect(prompt?.title).toBe("APEX: react documentation required");
});

test("gate: stale sub-agent evidence re-blocks freshness (TTL anchored on the tool-call ts)", async () => {
  let t = recordAgent(emptyTrack(), "subagent-explore-codebase", NOW - WINDOW - 1, "sufficient");
  t = recordAgent(t, "subagent-research-expert", NOW - WINDOW - 1, "sufficient");
  const prompt = await apexScopedGate(gateInput(), t, WINDOW);
  expect(prompt?.title).toBe("APEX: explore + research required");
});
