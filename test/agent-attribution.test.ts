import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { filesWrittenByAgent, attributeFiles } from "../src/runtime/lifecycle/agent-files";

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
