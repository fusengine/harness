import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detectProjectType, isApexCommand, DEV_KEYWORDS } from "../src/policy/detect-project";
import { countLines, evaluateFileSize } from "../src/policy/file-size";
import { GIT_BLOCKED, GIT_ASK, PROJECT_INSTALL, matchPatterns } from "../src/policy/patterns";
import { fileSizeGuard } from "../src/adapters/claude";
import { resolveMaxLines } from "../src/config/limits";

test("detectProjectType: generic then nextjs", () => {
  const dir = mkdtempSync(join(tmpdir(), "fh-proj-"));
  expect(detectProjectType(dir)).toBe("generic");
  writeFileSync(join(dir, "next.config.js"), "");
  expect(detectProjectType(dir)).toBe("nextjs");
});

test("isApexCommand + DEV_KEYWORDS", () => {
  expect(isApexCommand("/apex build")).toBe(true);
  expect(isApexCommand("hello")).toBe(false);
  expect(DEV_KEYWORDS.test("please refactor this")).toBe(true);
});

test("countLines + evaluateFileSize", () => {
  expect(countLines("")).toBe(0);
  expect(countLines("a\nb\nc")).toBe(3);
  expect(evaluateFileSize(50, 100).ok).toBe(true);
  const v = evaluateFileSize(120, 100);
  expect(v.ok).toBe(false);
  expect(v.message).toContain("max: 100");
});

test("git guard patterns", () => {
  expect(matchPatterns("git push --force", GIT_BLOCKED)).toBe(true);
  expect(matchPatterns("git reset --hard HEAD", GIT_BLOCKED)).toBe(true);
  // faithful to source guard: `git push.*--force` also matches --force-with-lease
  expect(matchPatterns("git push --force-with-lease", GIT_BLOCKED)).toBe(true);
  expect(matchPatterns("git rebase main", GIT_ASK)).toBe(true);
  expect(matchPatterns("npm install left-pad", PROJECT_INSTALL)).toBe(true);
  expect(matchPatterns("git status", GIT_BLOCKED)).toBe(false);
});

test("claude fileSizeGuard: allows small, denies oversized code", () => {
  const small = fileSizeGuard({ hook_event_name: "PreToolUse", tool_input: { file_path: "a.ts", content: "x\ny" } });
  expect(small).toBeNull();
  // Tracks the gate's own resolver (`FUSE_SOLID_MAX_LINES` ?? default) so this
  // fixture stays oversized regardless of the ambient env override.
  const big = "x\n".repeat(resolveMaxLines() + 50);
  const denied = fileSizeGuard({ hook_event_name: "PreToolUse", tool_input: { file_path: "a.ts", content: big } });
  expect(denied).toContain("permissionDecision");
  expect(denied).toContain("deny");
});
