import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCorpusRoot, resolvePluginsRoot } from "../src/policy/design/corpus";

/**
 * C2/C3: Claude Code also caches installed plugins at a SEPARATE versioned
 * tree, `~/.claude/plugins/cache/<mkt>/<plugin>/<version>/`, under a plugin
 * id that need not match the marketplace checkout's ("fuse-design" observed
 * on a real machine vs "design-expert" in marketplaces/). Identification
 * must be STRUCTURAL (the refs-design corpus suffix present under a version
 * dir), never a hardcoded plugin name.
 */
const home = (): string => realpathSync(mkdtempSync(join(tmpdir(), "fh-cache-")));
const REFS = join("skills", "design-web", "references", "refs-design");

test("claude-code cache tree: a corpus under ANY plugin id (not 'design-expert') is resolved", () => {
  const h = home();
  const de = join(h, ".claude", "plugins", "cache", "fusengine-plugins", "fuse-design", "2.2.3");
  mkdirSync(join(de, REFS), { recursive: true });
  expect(resolveCorpusRoot(undefined, h, "claude-code", {})).toBe(join(de, REFS));
  expect(resolvePluginsRoot(undefined, h, "claude-code", {})).toBe(de);
});

test("claude-code cache tree: highest semver wins among several installed versions", () => {
  const h = home();
  const plugin = join(h, ".claude", "plugins", "cache", "fusengine-plugins", "fuse-design");
  for (const v of ["2.1.30", "2.1.31", "2.2.0", "2.2.3"]) mkdirSync(join(plugin, v, REFS), { recursive: true });
  // An older version present WITHOUT the corpus suffix must not beat a newer one that has it.
  mkdirSync(join(plugin, "2.2.9", "skills"), { recursive: true });
  expect(resolveCorpusRoot(undefined, h, "claude-code", {})).toBe(join(plugin, "2.2.3", REFS));
});

test("claude-code cache tree: a plugin dir WITHOUT the corpus suffix is ignored (structural, not name-based)", () => {
  const h = home();
  // A sibling plugin cache (e.g. fuse-astro) must never be picked as the corpus root.
  mkdirSync(join(h, ".claude", "plugins", "cache", "fusengine-plugins", "fuse-astro", "1.0.0", "skills"), { recursive: true });
  expect(resolveCorpusRoot(undefined, h, "claude-code", {})).toBe("");
  expect(resolvePluginsRoot(undefined, h, "claude-code", {})).toBe("");
});

test("claude-code: marketplace tree still resolves when the cache tree is absent (non-regression)", () => {
  const h = home();
  const plugin = join(h, ".claude", "plugins", "marketplaces", "fusengine-plugins", "plugins", "design-expert");
  mkdirSync(join(plugin, REFS), { recursive: true });
  expect(resolveCorpusRoot(undefined, h, "claude-code", {})).toBe(join(plugin, REFS));
});

test("claude-code: marketplace tree wins over the cache tree when both exist", () => {
  const h = home();
  const marketplacePlugin = join(h, ".claude", "plugins", "marketplaces", "fusengine-plugins", "plugins", "design-expert");
  mkdirSync(join(marketplacePlugin, REFS), { recursive: true });
  const cachePlugin = join(h, ".claude", "plugins", "cache", "fusengine-plugins", "fuse-design", "2.2.3");
  mkdirSync(join(cachePlugin, REFS), { recursive: true });
  expect(resolvePluginsRoot(undefined, h, "claude-code", {})).toBe(marketplacePlugin);
});

test("claude-code: the cache tree is used when the marketplace tree is absent", () => {
  const h = home();
  const cachePlugin = join(h, ".claude", "plugins", "cache", "fusengine-plugins", "fuse-design", "2.2.3");
  mkdirSync(join(cachePlugin, REFS), { recursive: true });
  expect(resolvePluginsRoot(undefined, h, "claude-code", {})).toBe(cachePlugin);
});
