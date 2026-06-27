import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentsRanFromTranscript } from "../src/freshness/agent-evidence";
import { signTrack, verifyTrack } from "../src/tracking/integrity";
import { emptyTrack, recordAgent } from "../src/tracking/session-state";
import { protectedPathGuard } from "../src/policy/guards/protected-path";

/** Write a transcript JSONL with a Task tool_use per name, timestamped `ts`. */
function transcriptWith(names: string[], ts: number): string {
  const dir = mkdtempSync(join(tmpdir(), "fh-tr-"));
  const lines = names.map((n) => JSON.stringify({
    timestamp: new Date(ts).toISOString(),
    message: { content: [{ type: "tool_use", name: "Task", input: { subagent_type: n } }] },
  }));
  const file = join(dir, "t.jsonl");
  writeFileSync(file, lines.join("\n") + "\n");
  return file;
}

test("B: real transcript passes; a forged track cannot substitute", () => {
  const now = 1_000_000;
  const ok = transcriptWith(["explore-codebase", "research-expert"], now);
  expect(agentsRanFromTranscript(ok, ["explore-codebase", "research-expert"], 120_000, now)).toBe(true);
  // No transcript → false: the gate falls back to the track only when none exists,
  // so when a transcript IS present a forged track.agents array cannot satisfy it.
  expect(agentsRanFromTranscript(undefined, ["explore-codebase"], 120_000, now)).toBe(false);
  // Stale (beyond window) → false.
  const old = transcriptWith(["explore-codebase"], now - 200_000);
  expect(agentsRanFromTranscript(old, ["explore-codebase"], 120_000, now)).toBe(false);
});

test("D: integrity sign/verify round-trips; tampered data fails closed", () => {
  const track = recordAgent(emptyTrack(), "explore-codebase", 1);
  const env = signTrack(track);
  expect(verifyTrack(env)?.agents.length).toBe(1);
  expect(verifyTrack({ ...env, data: env.data.replace("explore", "HACK") })).toBeNull();
});

test("C: protected-path blocks Write + Bash redirect into state", () => {
  expect(protectedPathGuard({ tool: "Write", filePath: "/p/.claude/apex/task.json" })?.kind).toBe("block");
  expect(protectedPathGuard({ tool: "Bash", command: "echo x > ~/.claude/fuse-harness/state/a/track.json" })?.kind).toBe("block");
  expect(protectedPathGuard({ tool: "Bash", command: "git status" })).toBeNull();
});
