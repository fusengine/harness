import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCursorPluginRoot } from "../src/adapters/cursor/plugin-root";

const scratch = (prefix: string): string => mkdtempSync(join(tmpdir(), prefix));

/** Write a `.cursor-plugin/plugin.json` marker into `dir`. */
function markLocalPlugin(dir: string): void {
  mkdirSync(join(dir, ".cursor-plugin"), { recursive: true });
  writeFileSync(join(dir, ".cursor-plugin", "plugin.json"), "{}");
}

test("resolveCursorPluginRoot: CURSOR_PLUGIN_ROOT env wins over everything", () => {
  const dir = scratch("fh-cursor-plugin-");
  const result = resolveCursorPluginRoot({ CURSOR_PLUGIN_ROOT: dir, CLAUDE_PLUGIN_ROOT: "/other" }, "/unrelated/cwd");
  expect(result.source).toBe("env:CURSOR_PLUGIN_ROOT");
  expect(result.root).toBe(realpathSync.native(dir));
});

test("resolveCursorPluginRoot: CLAUDE_PLUGIN_ROOT env wins when CURSOR_PLUGIN_ROOT is absent", () => {
  const dir = scratch("fh-cursor-plugin-");
  const result = resolveCursorPluginRoot({ CLAUDE_PLUGIN_ROOT: dir }, "/unrelated/cwd");
  expect(result.source).toBe("env:CLAUDE_PLUGIN_ROOT");
  expect(result.root).toBe(realpathSync.native(dir));
});

test("resolveCursorPluginRoot: local plugin install detected via cwd marker, env absent", () => {
  const dir = scratch("fh-cursor-plugin-local-");
  markLocalPlugin(dir);
  const result = resolveCursorPluginRoot({}, dir);
  expect(result.source).toBe("cwd:plugin-marker");
  expect(result.root).toBe(realpathSync.native(dir));
});

test("resolveCursorPluginRoot: simulated marketplace cache layout detected via cwd marker", () => {
  const home = scratch("fh-cursor-home-");
  const cacheLeaf = join(home, ".cursor", "plugins", "cache", "fusengine-plugins", "fuse-typescript", "1.0.4");
  mkdirSync(join(cacheLeaf, "hooks"), { recursive: true });
  writeFileSync(join(cacheLeaf, "hooks", "hooks.json"), "{}");
  const result = resolveCursorPluginRoot({}, cacheLeaf);
  expect(result.source).toBe("cwd:plugin-marker");
  expect(result.root).toBe(realpathSync.native(cacheLeaf));
});

test("resolveCursorPluginRoot: env value resolves through a symlink to its realpath", () => {
  const base = scratch("fh-cursor-symlink-");
  const actual = join(base, "actual-plugin");
  mkdirSync(actual, { recursive: true });
  const alias = join(base, "alias-plugin");
  symlinkSync(actual, alias);
  const result = resolveCursorPluginRoot({ CURSOR_PLUGIN_ROOT: alias }, "/cwd");
  expect(result.source).toBe("env:CURSOR_PLUGIN_ROOT");
  expect(result.root).toBe(realpathSync.native(actual));
});

test("resolveCursorPluginRoot: env path with spaces is accepted", () => {
  const base = scratch("fh-cursor-spaces-");
  const dir = join(base, "my plugin root");
  mkdirSync(dir, { recursive: true });
  const result = resolveCursorPluginRoot({ CURSOR_PLUGIN_ROOT: dir }, "/cwd");
  expect(result.source).toBe("env:CURSOR_PLUGIN_ROOT");
  expect(result.root).toBe(realpathSync.native(dir));
});

test("resolveCursorPluginRoot: env absent, cwd unmarked -> none, with checked reasons", () => {
  const dir = scratch("fh-cursor-unmarked-");
  const result = resolveCursorPluginRoot({}, dir);
  expect(result.source).toBe("none");
  expect(result.root).toBeNull();
  expect(result.checked.length).toBeGreaterThan(0);
  expect(result.checked.some((c) => c.includes("CURSOR_PLUGIN_ROOT"))).toBe(true);
  expect(result.checked.some((c) => c.includes("CLAUDE_PLUGIN_ROOT"))).toBe(true);
});

test("resolveCursorPluginRoot: env pointing to a non-existent path is ignored, falls through to next candidate", () => {
  const validDir = scratch("fh-cursor-fallthrough-");
  const result = resolveCursorPluginRoot(
    { CURSOR_PLUGIN_ROOT: "/definitely/does/not/exist/anywhere", CLAUDE_PLUGIN_ROOT: validDir },
    "/cwd",
  );
  expect(result.source).toBe("env:CLAUDE_PLUGIN_ROOT");
  expect(result.root).toBe(realpathSync.native(validDir));
  expect(result.checked.some((c) => c.includes("CURSOR_PLUGIN_ROOT"))).toBe(true);
});

test("resolveCursorPluginRoot: cwd outside the project (npm/npx global bin) with env present -> env wins", () => {
  const dir = scratch("fh-cursor-plugin-npx-");
  const result = resolveCursorPluginRoot({ CURSOR_PLUGIN_ROOT: dir }, "/usr/local/lib/node_modules/npm/bin");
  expect(result.source).toBe("env:CURSOR_PLUGIN_ROOT");
  expect(result.root).toBe(realpathSync.native(dir));
});

test("resolveCursorPluginRoot: empty-string env var is treated as unset, not an invalid candidate crash", () => {
  const result = resolveCursorPluginRoot({ CURSOR_PLUGIN_ROOT: "" }, "/cwd");
  expect(result.source).toBe("none");
});
