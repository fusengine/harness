import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCorpusRoot, resolvePluginsRoot } from "../src/policy/design/corpus";

/** A fake $HOME, realpath'd (macOS /var → /private/var). */
const home = (): string => realpathSync(mkdtempSync(join(tmpdir(), "fh-res-")));
const REFS = join("skills", "design-web", "references", "refs-design");

test("claude-code: a corpus under the marketplace tree is resolved", () => {
  const h = home();
  const plugin = join(h, ".claude", "plugins", "marketplaces", "fusengine-plugins", "plugins", "design-expert");
  mkdirSync(join(plugin, REFS), { recursive: true });
  expect(resolveCorpusRoot(undefined, h, "claude-code", {})).toBe(join(plugin, REFS));
  expect(resolvePluginsRoot(undefined, h, "claude-code", {})).toBe(plugin);
});

test("codex: a corpus under the versioned plugin cache is resolved — highest semver wins", () => {
  const h = home();
  const de = join(h, ".codex", "plugins", "cache", "fusengine-codex", "design-expert");
  mkdirSync(join(de, "2.1.9", "skills"), { recursive: true });
  mkdirSync(join(de, "2.1.38", REFS), { recursive: true });
  expect(resolveCorpusRoot(undefined, h, "codex", {})).toBe(join(de, "2.1.38", REFS));
  expect(resolvePluginsRoot(undefined, h, "codex", {})).toBe(join(de, "2.1.38"));
});

test("codex: CODEX_HOME is honored when set", () => {
  const h = home();
  const codexHome = home();
  const de = join(codexHome, "plugins", "cache", "mp", "design-expert", "1.0.0");
  mkdirSync(join(de, REFS), { recursive: true });
  expect(resolveCorpusRoot(undefined, h, "codex", { CODEX_HOME: codexHome })).toBe(join(de, REFS));
});

test("runtimes without a plugin structure resolve to '' (kimi is not wired)", () => {
  const h = home();
  expect(resolveCorpusRoot(undefined, h, "kimi", {})).toBe("");
  expect(resolvePluginsRoot(undefined, h, "kimi", {})).toBe("");
});

test("codex without the plugin cache resolves to '' — never the cwd", () => {
  const h = home();
  expect(resolveCorpusRoot(undefined, h, "codex", {})).toBe("");
  expect(resolvePluginsRoot(undefined, h, "codex", {})).toBe("");
});

test("cross-runtime isolation: a corpus only in the OTHER runtime's tree is never resolved", () => {
  const h = home();
  // Corpus present ONLY in the Claude tree → codex must NOT fall back to it.
  const claudePlugin = join(h, ".claude", "plugins", "marketplaces", "mkt", "plugins", "design-expert");
  mkdirSync(join(claudePlugin, REFS), { recursive: true });
  expect(resolveCorpusRoot(undefined, h, "codex", {})).toBe("");
  // Corpus present ONLY in the Codex cache → claude-code must NOT fall back to it.
  const h2 = home();
  mkdirSync(join(h2, ".codex", "plugins", "cache", "mp", "design-expert", "1.0.0", REFS), { recursive: true });
  expect(resolveCorpusRoot(undefined, h2, "claude-code", {})).toBe("");
});

test("codex version selection: non-semver dirs and pre-releases never beat the stable", () => {
  const h = home();
  const de = join(h, ".codex", "plugins", "cache", "mp", "design-expert");
  for (const v of ["2.1.38", "3.0.0-rc1", "backup"]) mkdirSync(join(de, v, REFS), { recursive: true });
  expect(resolveCorpusRoot(undefined, h, "codex", {})).toBe(join(de, "2.1.38", REFS));
});
