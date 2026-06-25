import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { detectSolidProfile, solidDetectStart } from "../src/runtime/lifecycle/solid-detect";
import { readRules, injectRules } from "../src/runtime/lifecycle/inject-rules";
import { trackSessionChanges } from "../src/runtime/lifecycle/track-changes";
import { sessionStartCore } from "../src/runtime/lifecycle/session-start";
import { loadSessionState } from "../src/runtime/home-state";

const root = (): string => mkdtempSync(join(tmpdir(), "fh-life-"));

test("detectSolidProfile: nextjs (150) / swift (150) / unknown defaults", () => {
  const a = root();
  writeFileSync(join(a, "package.json"), JSON.stringify({ dependencies: { next: "16" } }));
  expect(detectSolidProfile(a)).toEqual({ type: "nextjs", limit: 150, ifaceDir: "modules/cores/interfaces" });
  const b = root();
  writeFileSync(join(b, "Package.swift"), "// swift");
  expect(detectSolidProfile(b)).toEqual({ type: "swift", limit: 150, ifaceDir: "Protocols" });
  expect(detectSolidProfile(root())).toEqual({ type: "unknown", limit: 100, ifaceDir: "" });
});

test("solidDetectStart: writes SOLID_* env exports + returns the stdout line", () => {
  const dir = root();
  writeFileSync(join(dir, "go.mod"), "module x");
  const envFile = join(dir, ".env");
  const out = solidDetectStart({ CLAUDE_PROJECT_DIR: dir, CLAUDE_ENV_FILE: envFile });
  expect(out).toBe("SOLID: go project (max 100 lines)");
  const written = readFileSync(envFile, "utf-8");
  expect(written).toContain("export SOLID_PROJECT_TYPE=go");
  expect(written).toContain("export SOLID_FILE_LIMIT=100");
});

test("readRules + injectRules: concatenates sorted *.md as additionalContext", () => {
  const pluginRoot = root();
  const rules = join(pluginRoot, "rules");
  mkdirSync(rules, { recursive: true });
  writeFileSync(join(rules, "01-a.md"), "ALPHA");
  writeFileSync(join(rules, "00-b.md"), "BETA");
  expect(readRules(rules)).toBe("BETA\n\nALPHA");
  const parsed = JSON.parse(injectRules(pluginRoot));
  expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
  expect(parsed.hookSpecificOutput.additionalContext).toBe("BETA\n\nALPHA");
  expect(injectRules(root())).toBe("");
});

test("trackSessionChanges: tracks code files + emits sniper reminder, skips non-code", () => {
  const home = root();
  expect(trackSessionChanges("s1", "notes.md", home)).toBe("");
  const out = trackSessionChanges("s1", "src/a.ts", home);
  expect(JSON.parse(out).hookSpecificOutput.additionalContext).toContain("SNIPER VALIDATION REQUIRED");
  const state = loadSessionState("s1", home) as { changes?: { cumulativeCodeFiles: number; modifiedFiles: string[] } };
  expect(state.changes?.cumulativeCodeFiles).toBe(1);
  expect(state.changes?.modifiedFiles).toContain("src/a.ts");
});

test("sessionStartCore: injects CLAUDE.md + project context, runs cleanups", () => {
  const home = root();
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(join(home, ".claude", "CLAUDE.md"), "# Rules");
  const cwd = root();
  writeFileSync(join(cwd, "package.json"), "{}");
  const out = sessionStartCore(cwd, home);
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  expect(ctx).toContain("# Rules");
  expect(ctx).toContain("Project: Node.js");
});
