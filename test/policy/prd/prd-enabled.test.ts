import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isPrdEnabled, isPrdFlagSet, prdProjectRoot, routerExistsSync } from "../../../src/policy/prd/prd-enabled";

describe("isPrdFlagSet", () => {
  test("exact \"1\" -> true", () => {
    expect(isPrdFlagSet({ FUSE_PRD: "1" })).toBe(true);
  });
  test("absent -> false", () => {
    expect(isPrdFlagSet({})).toBe(false);
  });
  test("\"true\" -> false", () => {
    expect(isPrdFlagSet({ FUSE_PRD: "true" })).toBe(false);
  });
  test("\"yes\" -> false", () => {
    expect(isPrdFlagSet({ FUSE_PRD: "yes" })).toBe(false);
  });
});

describe("prdProjectRoot", () => {
  test("CLAUDE_PROJECT_DIR wins when absolute", () => {
    expect(prdProjectRoot("/cwd", { CLAUDE_PROJECT_DIR: "/claude-root" })).toBe("/claude-root");
  });
  test("CURSOR_PROJECT_DIR is the fallback when CLAUDE_PROJECT_DIR is absent", () => {
    expect(prdProjectRoot("/cwd", { CURSOR_PROJECT_DIR: "/cursor-root" })).toBe("/cursor-root");
  });
  test("CLAUDE_PROJECT_DIR takes priority over CURSOR_PROJECT_DIR", () => {
    expect(prdProjectRoot("/cwd", { CLAUDE_PROJECT_DIR: "/claude-root", CURSOR_PROJECT_DIR: "/cursor-root" })).toBe("/claude-root");
  });
  test("a non-absolute env value is ignored, falls through", () => {
    expect(prdProjectRoot("/cwd", { CLAUDE_PROJECT_DIR: "relative/path" })).toBe("/cwd");
  });
  test("falls back to cwd when neither env var is set", () => {
    expect(prdProjectRoot("/cwd", {})).toBe("/cwd");
  });
});

describe("routerExistsSync", () => {
  test("true once the router file exists on disk", () => {
    const root = mkdtempSync(join(tmpdir(), "fh-prd-enabled-"));
    try {
      expect(routerExistsSync(root, ".claude")).toBe(false);
      mkdirSync(join(root, ".claude", "apex"), { recursive: true });
      writeFileSync(join(root, ".claude", "apex", "prd.json"), "{}", "utf8");
      expect(routerExistsSync(root, ".claude")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("isPrdEnabled — the single activation check", () => {
  test("flag absent -> false, without needing any real root/id", () => {
    expect(isPrdEnabled("/does/not/exist", "claude-code", {})).toBe(false);
  });
  test("\"1\" without a router file -> false", () => {
    const root = mkdtempSync(join(tmpdir(), "fh-prd-enabled-"));
    try {
      expect(isPrdEnabled(root, "claude-code", { FUSE_PRD: "1" })).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  test("\"1\" with a router file -> true", () => {
    const root = mkdtempSync(join(tmpdir(), "fh-prd-enabled-"));
    try {
      mkdirSync(join(root, ".claude", "apex"), { recursive: true });
      writeFileSync(join(root, ".claude", "apex", "prd.json"), "{}", "utf8");
      expect(isPrdEnabled(root, "claude-code", { FUSE_PRD: "1" })).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  test("\"true\"/\"yes\" never activate, even with a router file present", () => {
    const root = mkdtempSync(join(tmpdir(), "fh-prd-enabled-"));
    try {
      mkdirSync(join(root, ".claude", "apex"), { recursive: true });
      writeFileSync(join(root, ".claude", "apex", "prd.json"), "{}", "utf8");
      expect(isPrdEnabled(root, "claude-code", { FUSE_PRD: "true" })).toBe(false);
      expect(isPrdEnabled(root, "claude-code", { FUSE_PRD: "yes" })).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
