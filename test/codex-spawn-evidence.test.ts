import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { codexSpawnAgentType, creditCodexSpawnAgent, isCodexSpawnAgentTool, recordCodexSpawnEvidence } from "../src/freshness/codex-spawn-evidence";
import { agentsFreshInTrack } from "../src/freshness/agent-evidence-record";
import { emptyTrack } from "../src/tracking/session-state";
import { loadTrack } from "../src/tracking/store";

const NOW = 1_000_000;

function trackFile(): string {
  return join(mkdtempSync(join(tmpdir(), "fh-codex-spawn-")), "track.json");
}

test("isCodexSpawnAgentTool: bare + namespace-prefixed spawn_agent match, near-misses reject", () => {
  expect(isCodexSpawnAgentTool("spawn_agent")).toBe(true);
  expect(isCodexSpawnAgentTool("fusengine_agentsspawn_agent")).toBe(true);
  expect(isCodexSpawnAgentTool("collaborationspawn_agent")).toBe(true);
  // Contains the substring but is neither an exact match nor a suffix — must reject.
  expect(isCodexSpawnAgentTool("spawn_agentX")).toBe(false);
  expect(isCodexSpawnAgentTool("myspawn_agent_tool")).toBe(false);
  expect(isCodexSpawnAgentTool("Task")).toBe(false);
});

test("codexSpawnAgentType: reads tool_input.agent_type, trims, and is undefined when absent/blank", () => {
  expect(codexSpawnAgentType({ agent_type: "sniper" })).toBe("sniper");
  expect(codexSpawnAgentType({ agent_type: "  sniper  " })).toBe("sniper");
  expect(codexSpawnAgentType({})).toBeUndefined();
  expect(codexSpawnAgentType({ agent_type: "" })).toBeUndefined();
  expect(codexSpawnAgentType({ agent_type: 42 })).toBeUndefined();
  expect(codexSpawnAgentType(undefined)).toBeUndefined();
});

test("creditCodexSpawnAgent: spawn_agent + agent_type under codex → credited as subagent-<type>", () => {
  const t = creditCodexSpawnAgent("codex", "spawn_agent", { agent_type: "sniper" }, emptyTrack(), NOW);
  expect(t.agents).toEqual([{ name: "subagent-sniper", ts: NOW, quality: "sufficient" }]);
});

test("creditCodexSpawnAgent: namespace-prefixed tool names also credited", () => {
  const a = creditCodexSpawnAgent("codex", "fusengine_agentsspawn_agent", { agent_type: "explore-codebase" }, emptyTrack(), NOW);
  expect(a.agents.map((x) => x.name)).toEqual(["subagent-explore-codebase"]);
  const b = creditCodexSpawnAgent("codex", "collaborationspawn_agent", { agent_type: "research-expert" }, emptyTrack(), NOW);
  expect(b.agents.map((x) => x.name)).toEqual(["subagent-research-expert"]);
});

test("creditCodexSpawnAgent: agent_type absent → defined no-op, same track reference, never throws", () => {
  const before = emptyTrack();
  const after = creditCodexSpawnAgent("codex", "spawn_agent", {}, before, NOW);
  expect(after).toBe(before);
  expect(() => creditCodexSpawnAgent("codex", "spawn_agent", undefined, before, NOW)).not.toThrow();
  expect(creditCodexSpawnAgent("codex", "spawn_agent", undefined, before, NOW)).toBe(before);
});

test("creditCodexSpawnAgent: near-miss tool names never credited, even with agent_type present", () => {
  const before = emptyTrack();
  expect(creditCodexSpawnAgent("codex", "spawn_agentX", { agent_type: "sniper" }, before, NOW)).toBe(before);
  expect(creditCodexSpawnAgent("codex", "myspawn_agent_tool", { agent_type: "sniper" }, before, NOW)).toBe(before);
});

test("creditCodexSpawnAgent: strict no-op for every non-codex harness id, even with a matching tool + agent_type", () => {
  const before = emptyTrack();
  for (const id of ["claude-code", "cursor", "cline", "gemini-cli", "hermes"]) {
    expect(creditCodexSpawnAgent(id, "spawn_agent", { agent_type: "sniper" }, before, NOW)).toBe(before);
  }
});

test("recordCodexSpawnEvidence: persists into the SAME session track store (loadTrack sees it)", async () => {
  const file = trackFile();
  await recordCodexSpawnEvidence(file, "codex", "spawn_agent", { agent_type: "sniper" }, NOW);
  const t = await loadTrack(file);
  expect(t.agents).toEqual([{ name: "subagent-sniper", ts: NOW, quality: "sufficient" }]);
});

test("recordCodexSpawnEvidence: non-codex id never touches the track file (no write)", async () => {
  const file = trackFile();
  await recordCodexSpawnEvidence(file, "claude-code", "spawn_agent", { agent_type: "sniper" }, NOW);
  const t = await loadTrack(file);
  expect(t.agents).toEqual([]);
});

test("integration: an agent_type matching a REQUIRED_AGENTS name is picked up by agentsFreshInTrack's substring match", () => {
  let t = creditCodexSpawnAgent("codex", "spawn_agent", { agent_type: "explore-codebase" }, emptyTrack(), NOW);
  t = creditCodexSpawnAgent("codex", "spawn_agent", { agent_type: "research-expert" }, t, NOW);
  expect(agentsFreshInTrack(t, ["explore-codebase", "research-expert"], 120_000, NOW)).toBe(true);
});
