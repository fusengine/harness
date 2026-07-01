/**
 * Parity batch 4 — ai-pilot hooks.json cabling (bucket: aipilot-hooks).
 * The plugin file now wires ONE matcher-"" entry per lifecycle event
 * (SubagentStart/SubagentStop) plus a widened PostToolUse matcher
 * (TaskCreate|TaskUpdate|Write|Edit). These tests pin the dispatcher
 * invariants that cabling relies on: (1) SubagentStop runs the universal SOLID
 * transcript check for ANY agent (Python matcher ""), (2) the PostToolUse
 * Write/Edit branch is live, (3) a SINGLE SubagentStart dispatch emits the
 * combined lessons + type-specific context exactly once (so one entry suffices
 * and extra per-agent entries would double-inject).
 */
import { test, expect } from "bun:test";
import { tmpdir, homedir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { dispatchAipilot, aipilotPostToolUse } from "../src/runtime/lifecycle/aipilot/dispatch-aipilot";
import { cacheDirFor } from "../src/runtime/lifecycle/aipilot/cache-base";
import type { LessonEntry } from "../src/runtime/lifecycle/aipilot/types";

/** Write an oversized (>100 code lines) .ts file and return its path. */
function bigTsFile(dir: string, name = "big.ts"): string {
  const path = join(dir, name);
  writeFileSync(path, Array.from({ length: 110 }, (_, i) => `export const v${i} = ${i};`).join("\n"));
  return path;
}

/** Write a JSONL transcript containing one Write tool_use on `filePath`. */
function transcriptWith(dir: string, filePath: string): string {
  const path = join(dir, "transcript.jsonl");
  writeFileSync(path, `${JSON.stringify({ message: { content: [{ type: "tool_use", name: "Write", input: { file_path: filePath } }] } })}\n`);
  return path;
}

/** Single-error lessons cache payload (same shape as aipilot-lessons-cache.test.ts). */
function lessonFile(pattern: string): { errors: LessonEntry[] } {
  return { errors: [{ error_type: "code_fix", pattern, fix: "Fix code_fix", count: 1, last_seen: "t", files: ["a.ts"], code: { line: ["x"] } }] };
}

test("SubagentStop matcher '' parity: SOLID transcript check fires for ANY agent type", async () => {
  const project = mkdtempSync(join(tmpdir(), "fh-b4-stop-"));
  const transcript = transcriptWith(project, bigTsFile(project));
  // An agent NOT in the old sniper|research-expert cabling must still get the check.
  const out = await dispatchAipilot("SubagentStop", { agent_type: "laravel-expert", agent_transcript_path: transcript }, project, Date.now());
  expect(out).toContain("SOLID VIOLATIONS DETECTED");
  expect(out).toContain("big.ts");
});

test("PostToolUse Write|Edit cabling: checkSolidCompliance branch is reachable", async () => {
  const project = mkdtempSync(join(tmpdir(), "fh-b4-post-"));
  const big = bigTsFile(project);
  for (const tool of ["Write", "Edit"]) {
    const out = await aipilotPostToolUse({ tool_name: tool, tool_input: { file_path: big } }, project);
    expect(out).toContain("SOLID COMPLIANCE CHECK");
    expect(out).toContain("FILE SIZE");
  }
});

test("SubagentStart single dispatch: combined lessons + type-specific cache in ONE response", async () => {
  // dispatchAipilot threads the real homedir(); seed both caches for a unique
  // project so a lone matcher-"" hooks.json entry provably loses nothing.
  const project = mkdtempSync(join(tmpdir(), "fh-b4-start-"));
  const prevProjDir = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = project;
  const lessonsDir = cacheDirFor("lessons", project, homedir());
  const docDir = cacheDirFor("doc", project, homedir());
  mkdirSync(lessonsDir, { recursive: true });
  mkdirSync(join(docDir, "docs"), { recursive: true });
  writeFileSync(join(lessonsDir, "a.json"), JSON.stringify(lessonFile("a b4 cabling issue")));
  writeFileSync(join(docDir, "index.json"), JSON.stringify({ docs: [{ timestamp: new Date().toISOString(), hash: "cafe01" }] }));
  writeFileSync(join(docDir, "docs", "cafe01.md"), "Parity b4 doc body");
  try {
    const out = await dispatchAipilot("SubagentStart", { agent_type: "research-expert" }, project, Date.now());
    // Both blocks arrive from ONE call — extra per-agent hooks.json entries would only duplicate them.
    expect((out ?? "").split("KNOWN PROJECT ISSUES").length - 1).toBe(1);
    expect((out ?? "").split("CACHED DOCUMENTATION").length - 1).toBe(1);
    expect(out).toContain("Parity b4 doc body");
  } finally {
    rmSync(lessonsDir, { recursive: true, force: true });
    rmSync(docDir, { recursive: true, force: true });
    if (prevProjDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = prevProjDir;
  }
});
