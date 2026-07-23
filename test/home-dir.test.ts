import { test, expect } from "bun:test";
import { join } from "node:path";
import { harnessHome } from "../src/config/home-dir";

test("harnessHome: defaults match the HOME_DIR table (zero-regression)", () => {
  expect(harnessHome("kimi", {}, "/h")).toBe(join("/h", ".kimi-code"));
  expect(harnessHome("claude-code", {}, "/h")).toBe(join("/h", ".claude"));
  expect(harnessHome("codex", {}, "/h")).toBe(join("/h", ".codex"));
});

test("harnessHome: KIMI_CODE_HOME relocates the kimi home; other harnesses ignore it", () => {
  const env = { KIMI_CODE_HOME: "/data/kimi" };
  expect(harnessHome("kimi", env, "/h")).toBe("/data/kimi");
  expect(harnessHome("claude-code", env, "/h")).toBe(join("/h", ".claude"));
  expect(harnessHome("codex", env, "/h")).toBe(join("/h", ".codex"));
});
