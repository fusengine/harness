import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { trackAgentMemory } from "../src/runtime/lifecycle/agent-memory";
import { saveSessionState } from "../src/runtime/home-state";

/** Write a JSONL transcript of `tool_use` blocks and return its path. */
function transcript(blocks: Array<{ name: string; file_path?: string }>): string {
  const dir = mkdtempSync(join(tmpdir(), "fh-stop-"));
  const lines = blocks.map((b) =>
    JSON.stringify({ message: { content: [{ type: "tool_use", name: b.name, input: { file_path: b.file_path } }] } }),
  );
  const file = join(dir, "agent.jsonl");
  writeFileSync(file, lines.join("\n") + "\n");
  return file;
}

/** Create a real file on disk and return its absolute path — the SubagentStop reminder
 * stats the disk, so an owned path must exist to be reported. */
function realFile(name: string): string {
  const p = join(mkdtempSync(join(tmpdir(), "fh-disk-")), name);
  writeFileSync(p, "x");
  return p;
}

/** An absolute path whose file was never written (models an rm'd/never-flushed file). */
function absentPath(name: string): string {
  return join(mkdtempSync(join(tmpdir(), "fh-gone-")), name);
}

// --- trackAgentMemory: end-to-end attribution (owned files exist on disk) ---

test("trackAgentMemory: transcript present → only this agent's files attributed", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-h1-"));
  const mine = realFile("mine.ts");
  saveSessionState("s1", { changes: { cumulativeCodeFiles: 3, modifiedFiles: [mine, "/repo/tm1.ts", "/repo/tm2.ts"] } }, home);
  const t = transcript([{ name: "Write", file_path: mine }]);
  const out = trackAgentMemory({ agent_type: "react-expert", session_id: "s1", agent_transcript_path: t }, home, 1000);
  expect(out).toContain(`modified 1 code file(s): ${mine}`);
  expect(out).not.toContain("tm1.ts");
  expect(out).not.toContain("tm2.ts");
});

test("trackAgentMemory: agent wrote none of the tracked files → no reminder, counter kept", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-h2-"));
  const tm = realFile("teammate.ts");
  saveSessionState("s2", { changes: { cumulativeCodeFiles: 2, modifiedFiles: [tm] } }, home);
  const t = transcript([{ name: "Read", file_path: tm }]); // only read, no write
  expect(trackAgentMemory({ agent_type: "react-expert", session_id: "s2", agent_transcript_path: t }, home, 1000)).toContain("no code changes");
  // Counter NOT reset → the real author still triggers on its own stop.
  expect(trackAgentMemory({ agent_type: "react-expert", session_id: "s2" }, home, 1000)).toContain(`modified 1 code file(s): ${tm}`);
});

test("trackAgentMemory: transcript absent → fallback to full session list (no regression)", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-h3-"));
  const a = realFile("a.ts"), b = realFile("b.ts");
  saveSessionState("s3", { changes: { cumulativeCodeFiles: 2, modifiedFiles: [a, b] } }, home);
  expect(trackAgentMemory({ agent_type: "react-expert", session_id: "s3" }, home, 1000)).toContain(`modified 2 code file(s): ${a}, ${b}`);
});

test("trackAgentMemory: transcript present but unreadable → fail-open to full list", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-h4-"));
  const a = realFile("a.ts"), b = realFile("b.ts");
  saveSessionState("s4", { changes: { cumulativeCodeFiles: 2, modifiedFiles: [a, b] } }, home);
  const out = trackAgentMemory({ agent_type: "react-expert", session_id: "s4", agent_transcript_path: "/no/such.jsonl" }, home, 1000);
  expect(out).toContain(`modified 2 code file(s): ${a}, ${b}`);
});

// --- trackAgentMemory: deleted-file guard (no bogus sniper on an rm'd path) ---

test("trackAgentMemory: owned file deleted before stop → no reminder (no false sniper)", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-h5-"));
  const gone = absentPath("probe.ts"); // agent authored it, then it was rm'd before the hook
  saveSessionState("s5", { changes: { cumulativeCodeFiles: 1, modifiedFiles: [gone] } }, home);
  const t = transcript([{ name: "Write", file_path: gone }]);
  const out = trackAgentMemory({ agent_type: "react-expert", session_id: "s5", agent_transcript_path: t }, home, 1000);
  expect(out).toContain("no code changes");
  expect(out).not.toContain("SNIPER VALIDATION");
});

test("trackAgentMemory: mixed present+deleted → reminder lists only the file still on disk", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-h6-"));
  const kept = realFile("kept.ts");
  const gone = absentPath("gone.ts");
  saveSessionState("s6", { changes: { cumulativeCodeFiles: 2, modifiedFiles: [kept, gone] } }, home);
  const out = trackAgentMemory({ agent_type: "react-expert", session_id: "s6" }, home, 1000);
  expect(out).toContain(`modified 1 code file(s): ${kept}`);
  expect(out).not.toContain("gone.ts");
});
