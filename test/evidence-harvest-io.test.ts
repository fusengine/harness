import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { harvestSubagentTrack } from "../src/freshness/evidence-harvest-io";
import { agentsFreshInTrack } from "../src/freshness/agent-evidence-record";
import { emptyTrack, recordAgent } from "../src/tracking/session-state";
import { loadTrack, saveTrack } from "../src/tracking/store";
import { trackFile } from "../src/runtime/paths";

const NOW = 1_000_000;
const WINDOW = 120_000;

/** One transcript tool_use block with an optional epoch-ms timestamp. */
interface Block { name: string; input?: Record<string, unknown>; ts?: number }

/** Write a JSONL sub-agent transcript (ISO timestamps) and return its path. */
function transcript(blocks: Block[]): string {
  const dir = mkdtempSync(join(tmpdir(), "fh-hvio-tr-"));
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

test("harvestSubagentTrack: backfills the on-disk track so the gate passes next turn", async () => {
  const baseDir = mkdtempSync(join(tmpdir(), "fh-hvio-st-"));
  const sid = "s-harvest";
  const payload = {
    session_id: sid,
    agent_transcript_path: transcript([
      { name: "mcp__exa__web_search_exa", input: { query: "q" }, ts: NOW - 1000 },
      { name: "Glob", input: { pattern: "**/*.ts" }, ts: NOW - 900 },
    ]),
  };
  harvestSubagentTrack(payload, "/proj", NOW, baseDir);
  const track = await loadTrack(trackFile(sid, baseDir));
  expect(agentsFreshInTrack(track, ["explore-codebase", "research-expert"], WINDOW, NOW)).toBe(true);
});

test("harvestSubagentTrack: preserves live evidence already on disk, adds only the new", async () => {
  const baseDir = mkdtempSync(join(tmpdir(), "fh-hvio-st2-"));
  const sid = "s-merge";
  const file = trackFile(sid, baseDir);
  await saveTrack(file, recordAgent(emptyTrack(), "subagent-explore-codebase", NOW - 2000, "sufficient"));
  const payload = { session_id: sid, agent_transcript_path: transcript([{ name: "WebSearch", input: { query: "q" }, ts: NOW }]) };
  harvestSubagentTrack(payload, "/proj", NOW, baseDir);
  const track = await loadTrack(file);
  expect(track.agents.map((a) => a.name).sort()).toEqual(["subagent-explore-codebase", "subagent-research-expert"]);
});

test("harvestSubagentTrack: no agent_transcript_path → no track file written", async () => {
  const baseDir = mkdtempSync(join(tmpdir(), "fh-hvio-st3-"));
  const sid = "s-none";
  harvestSubagentTrack({ session_id: sid }, "/proj", NOW, baseDir);
  expect((await loadTrack(trackFile(sid, baseDir))).agents).toHaveLength(0);
});
