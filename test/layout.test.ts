import { test, expect } from "bun:test";
import { projectLayout, STATE_ROOT, STATE_GITIGNORE } from "../src/config/layout";

test("projectLayout: every path derives from one root under .harness", () => {
  const l = projectLayout("/proj");
  expect(STATE_ROOT).toBe(".harness");
  expect(l.stateDir).toBe("/proj/.harness");
  expect(l.trackDir).toBe("/proj/.harness/track");
  expect(l.cacheDir).toBe("/proj/.harness/cache");
  expect(l.memoryDir).toBe("/proj/.harness/memory");
  expect(l.lessonsFile).toBe("/proj/.harness/memory/LESSON.md");
  expect(l.memoryStateFile).toBe("/proj/.harness/memory/state.json");
  expect(l.gitignoreFile).toBe("/proj/.harness/.gitignore");
});

test("STATE_GITIGNORE ignores machine state, keeps LESSON.md", () => {
  expect(STATE_GITIGNORE).toContain("track/");
  expect(STATE_GITIGNORE).toContain("cache/");
  expect(STATE_GITIGNORE).toContain("memory/state.json");
  expect(STATE_GITIGNORE).not.toContain("LESSON");
});
