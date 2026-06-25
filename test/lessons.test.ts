import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dispatchLessons } from "../src/runtime/lifecycle/lessons/dispatch";
import { lessonsFileFor, lessonsStateFileFor } from "../src/runtime/lifecycle/lessons/state";
import { readState } from "../src/memory/state";

test("lessonsFileFor / lessonsStateFileFor: <root>/MEMORY paths", () => {
  expect(lessonsFileFor("/a/b")).toBe("/a/b/MEMORY/LESSON.md");
  expect(lessonsStateFileFor("/a/b")).toBe("/a/b/MEMORY/state.json");
});

test("dispatchLessons SessionStart: injects MEMORY/LESSON.md", () => {
  const root = mkdtempSync(join(tmpdir(), "fh-less-"));
  writeFileSync(join(root, "package.json"), "{}");
  mkdirSync(join(root, "MEMORY"), { recursive: true });
  writeFileSync(lessonsFileFor(root), "- never break the build");
  const out = dispatchLessons("SessionStart", {}, root, Date.now());
  expect(out).toContain("Project lessons");
  expect(out).toContain("never break the build");
});

test("dispatchLessons PostToolUse: code file arms lastCodeEditAt, LESSON.md arms lastRemindedAt", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-home-"));
  process.env.HOME = home;
  const root = mkdtempSync(join(tmpdir(), "fh-proj-"));
  writeFileSync(join(root, "package.json"), "{}");
  mkdirSync(join(root, "MEMORY"), { recursive: true });

  const codePath = join(root, "src", "feature.ts");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(codePath, "export const x = 1;");
  dispatchLessons("PostToolUse", { tool_input: { file_path: codePath } }, root, 1000);
  expect(readState(lessonsStateFileFor(root)).lastCodeEditAt).toBe(1000);

  dispatchLessons("PostToolUse", { tool_input: { file_path: lessonsFileFor(root) } }, root, 2000);
  expect(readState(lessonsStateFileFor(root)).lastRemindedAt).toBe(2000);
});
