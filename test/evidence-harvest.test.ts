import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { harvestAgentEvidence } from "../src/freshness/evidence-harvest";
import { agentsFreshInTrack } from "../src/freshness/agent-evidence-record";
import { emptyTrack, recordAgent, recordRefRead, type SessionTrack } from "../src/tracking/session-state";

const NOW = 1_000_000;
const WINDOW = 120_000;

/** One transcript tool_use block with an optional epoch-ms timestamp. */
interface Block { name: string; input?: Record<string, unknown>; ts?: number }

/** Write a JSONL sub-agent transcript (ISO timestamps) and return its path. */
function transcript(blocks: Block[]): string {
  const dir = mkdtempSync(join(tmpdir(), "fh-hv-tr-"));
  const lines = blocks.map((b) =>
    JSON.stringify({
      ...(b.ts !== undefined ? { timestamp: new Date(b.ts).toISOString() } : {}),
      message: { content: [{ type: "tool_use", name: b.name, input: b.input ?? {} }] },
    }),
  );
  const file = join(dir, "agent.jsonl");
  writeFileSync(file, lines.join("\n") + "\n");
  return file;
}

test("harvestAgentEvidence: research + explore + .md read → agents + refsReadAt backfilled", () => {
  const t = transcript([
    { name: "WebSearch", input: { query: "q" }, ts: NOW - 1000 },
    { name: "Grep", input: { pattern: "x" }, ts: NOW - 900 },
    { name: "Read", input: { file_path: "/repo/SKILL.md" }, ts: NOW - 800 },
  ]);
  const out = harvestAgentEvidence(t, emptyTrack(), NOW);
  expect(out.agents.map((a) => a.name)).toEqual(["subagent-research-expert", "subagent-explore-codebase"]);
  expect(out.agents.every((a) => a.quality === "sufficient")).toBe(true);
  expect(out.refsReadAt?.["/repo/SKILL.md"]).toBe(NOW - 800);
  // The whole point: the freshness gate now passes off the harvested evidence.
  expect(agentsFreshInTrack(out, ["explore-codebase", "research-expert"], WINDOW, NOW)).toBe(true);
});

test("harvestAgentEvidence: unstamped tool_use falls back to `now`", () => {
  const out = harvestAgentEvidence(transcript([{ name: "WebFetch", input: { url: "u" } }]), emptyTrack(), NOW);
  expect(out.agents[0]?.ts).toBe(NOW);
});

test("harvestAgentEvidence: absent/unreadable transcript → same track reference (no-op, fail-open)", () => {
  const base = emptyTrack();
  expect(harvestAgentEvidence(undefined, base, NOW)).toBe(base);
  expect(harvestAgentEvidence("/no/such.jsonl", base, NOW)).toBe(base);
});

test("harvestAgentEvidence: Task/Agent launches and non-.md reads are not credited", () => {
  const out = harvestAgentEvidence(transcript([
    { name: "Task", input: { subagent_type: "research-expert" } },
    { name: "Read", input: { file_path: "/repo/a.ts" } },
  ]), emptyTrack(), NOW);
  expect(out.agents).toHaveLength(0);
  expect(out.refsRead).toHaveLength(0);
});

test("harvestAgentEvidence: an entry already present within ±2s is not duplicated", () => {
  const seeded = recordAgent(emptyTrack(), "subagent-research-expert", NOW - 500, "sufficient");
  const out = harvestAgentEvidence(transcript([{ name: "WebSearch", input: { query: "q" }, ts: NOW }]), seeded, NOW);
  expect(out.agents.filter((a) => a.name === "subagent-research-expert")).toHaveLength(1);
});

test("harvestAgentEvidence: a more-recent refsReadAt stamp is never overwritten by an older read", () => {
  const seeded: SessionTrack = recordRefRead(emptyTrack(), "/repo/SKILL.md", NOW);
  const out = harvestAgentEvidence(transcript([{ name: "Read", input: { file_path: "/repo/SKILL.md" }, ts: NOW - 5000 }]), seeded, NOW);
  expect(out.refsReadAt?.["/repo/SKILL.md"]).toBe(NOW); // kept the newer stamp
});
