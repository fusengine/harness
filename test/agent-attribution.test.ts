import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { filesWrittenByAgent, attributeFiles } from "../src/runtime/lifecycle/agent-files";
import { trackAgentMemory } from "../src/runtime/lifecycle/agent-memory";
import { saveSessionState } from "../src/runtime/home-state";

/** Write a JSONL transcript of `tool_use` blocks and return its path. */
function transcript(blocks: Array<{ name: string; file_path?: string }>): string {
  const dir = mkdtempSync(join(tmpdir(), "fh-attr-"));
  const lines = blocks.map((b) =>
    JSON.stringify({ message: { content: [{ type: "tool_use", name: b.name, input: { file_path: b.file_path } }] } }),
  );
  const file = join(dir, "agent.jsonl");
  writeFileSync(file, lines.join("\n") + "\n");
  return file;
}

// --- filesWrittenByAgent: transcript parsing ---

test("filesWrittenByAgent: collects Write/Edit file_paths, skips reads, dedups", () => {
  const t = transcript([
    { name: "Write", file_path: "/repo/a.ts" },
    { name: "Read", file_path: "/repo/other.ts" },
    { name: "Edit", file_path: "/repo/b.ts" },
    { name: "Edit", file_path: "/repo/a.ts" }, // duplicate → collapsed
  ]);
  expect(filesWrittenByAgent(t)).toEqual(["/repo/a.ts", "/repo/b.ts"]);
});

test("filesWrittenByAgent: absent path → null (caller falls back to full list)", () => {
  expect(filesWrittenByAgent(undefined)).toBeNull();
});

test("filesWrittenByAgent: unreadable transcript → null (fail-open)", () => {
  expect(filesWrittenByAgent("/no/such/transcript.jsonl")).toBeNull();
});

test("filesWrittenByAgent: read-fine but no writes → [] (not null)", () => {
  const t = transcript([{ name: "Read", file_path: "/repo/x.ts" }, { name: "Grep" }]);
  expect(filesWrittenByAgent(t)).toEqual([]);
});

// --- attributeFiles: intersection with session list ---

test("attributeFiles: keeps only agent-written, matches basename despite path drift", () => {
  const session = ["src/a.ts", "/repo/b.ts", "src/other.ts"];
  const written = ["/repo/a.ts", "/repo/b.ts"]; // a.ts recorded relative, written absolute
  expect(attributeFiles(session, written)).toEqual(["src/a.ts", "/repo/b.ts"]);
});

// --- trackAgentMemory: end-to-end attribution ---

test("trackAgentMemory: transcript present → only this agent's files attributed", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-h1-"));
  const sid = "s1";
  saveSessionState(sid, { changes: { cumulativeCodeFiles: 3, modifiedFiles: ["/repo/mine.ts", "/repo/tm1.ts", "/repo/tm2.ts"] } }, home);
  const t = transcript([{ name: "Write", file_path: "/repo/mine.ts" }]);
  const out = trackAgentMemory({ agent_type: "react-expert", session_id: sid, agent_transcript_path: t }, home, 1000);
  expect(out).toContain("modified 1 code file(s): /repo/mine.ts");
  expect(out).not.toContain("tm1.ts");
  expect(out).not.toContain("tm2.ts");
});

test("trackAgentMemory: agent wrote none of the tracked files → no reminder, counter kept", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-h2-"));
  const sid = "s2";
  saveSessionState(sid, { changes: { cumulativeCodeFiles: 2, modifiedFiles: ["/repo/teammate.ts"] } }, home);
  const t = transcript([{ name: "Read", file_path: "/repo/teammate.ts" }]); // only read, no write
  expect(trackAgentMemory({ agent_type: "react-expert", session_id: sid, agent_transcript_path: t }, home, 1000)).toContain("no code changes");
  // Counter NOT reset → the real author still triggers on its own stop.
  expect(trackAgentMemory({ agent_type: "react-expert", session_id: sid }, home, 1000)).toContain("modified 1 code file(s): /repo/teammate.ts");
});

test("trackAgentMemory: transcript absent → fallback to full session list (no regression)", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-h3-"));
  const sid = "s3";
  saveSessionState(sid, { changes: { cumulativeCodeFiles: 2, modifiedFiles: ["a.ts", "b.ts"] } }, home);
  expect(trackAgentMemory({ agent_type: "react-expert", session_id: sid }, home, 1000)).toContain("modified 2 code file(s): a.ts, b.ts");
});

test("trackAgentMemory: transcript present but unreadable → fail-open to full list", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-h4-"));
  const sid = "s4";
  saveSessionState(sid, { changes: { cumulativeCodeFiles: 2, modifiedFiles: ["a.ts", "b.ts"] } }, home);
  const out = trackAgentMemory({ agent_type: "react-expert", session_id: sid, agent_transcript_path: "/no/such.jsonl" }, home, 1000);
  expect(out).toContain("modified 2 code file(s): a.ts, b.ts");
});
