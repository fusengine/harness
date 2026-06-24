import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { claudeInit, cursorInit, geminiInit, clineInit } from "../src/init/templates";
import { initFor, writeInitFile } from "../src/init/run";

test("templates: pre + post wiring per harness", () => {
  const claude = JSON.parse(claudeInit("c")[0]!.content) as { hooks: { PreToolUse: { matcher: string }[]; PostToolUse: unknown[] } };
  expect(claude.hooks.PreToolUse[0]?.matcher).toBe("Write|Edit");
  expect(claude.hooks.PostToolUse.length).toBe(1);
  expect((JSON.parse(cursorInit("x")[0]!.content) as { version: number }).version).toBe(1);
  const gemini = JSON.parse(geminiInit("x")[0]!.content) as { hooks: { AfterTool: unknown[] } };
  expect(gemini.hooks.AfterTool.length).toBe(1);
  const cline = clineInit("npx harness hook cline");
  expect(cline.length).toBe(2);
  expect(cline.map((f) => f.path)).toContain(".clinerules/hooks/PostToolUse");
  expect(cline[0]?.executable).toBe(true);
});

test("initFor: hook harness -> files, cli-only -> null", () => {
  expect(initFor("claude-code")?.[0]?.path).toBe(".claude/settings.json");
  expect(initFor("codex")?.[0]?.path).toBe(".codex/hooks.json");
  expect(initFor("cline")?.length).toBe(3);
  expect(initFor("cline")?.at(-1)?.path).toBe(".harness/.gitignore");
  expect(initFor("aider")).toBeNull();
});

test("writeInitFile: writes + chmod executable", () => {
  const root = mkdtempSync(join(tmpdir(), "fh-init-"));
  const files = initFor("cline");
  expect(files).not.toBeNull();
  const written = writeInitFile(root, files![0]!);
  expect(existsSync(written)).toBe(true);
  expect(statSync(written).mode & 0o111).toBeGreaterThan(0);
});
