import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { claudeInit, cursorInit, geminiInit, clineInit } from "../src/init/templates";
import { initFor, writeInitFile } from "../src/init/run";

test("templates: valid wiring per harness", () => {
  const claude = JSON.parse(claudeInit("npx harness hook claude-code").content) as { hooks: { PreToolUse: { matcher: string }[] } };
  expect(claude.hooks.PreToolUse[0]?.matcher).toBe("Write|Edit");
  expect((JSON.parse(cursorInit("x").content) as { version: number }).version).toBe(1);
  const gemini = JSON.parse(geminiInit("x").content) as { hooks: { BeforeTool: { hooks: { type: string }[] }[] } };
  expect(gemini.hooks.BeforeTool[0]?.hooks[0]?.type).toBe("command");
  const cline = clineInit("npx harness hook cline");
  expect(cline.executable).toBe(true);
  expect(cline.content).toContain("#!/usr/bin/env bash");
});

test("initFor: hook harness -> file, cli-only -> null", () => {
  expect(initFor("claude-code")?.path).toBe(".claude/settings.json");
  expect(initFor("codex")?.path).toBe(".codex/hooks.json");
  expect(initFor("cursor")?.path).toBe(".cursor/hooks.json");
  expect(initFor("aider")).toBeNull();
});

test("writeInitFile: writes + chmod executable", () => {
  const root = mkdtempSync(join(tmpdir(), "fh-init-"));
  const file = initFor("cline");
  expect(file).not.toBeNull();
  const written = writeInitFile(root, file!);
  expect(existsSync(written)).toBe(true);
  expect(statSync(written).mode & 0o111).toBeGreaterThan(0);
});
