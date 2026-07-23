import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveRulesRoot } from "../src/runtime/lifecycle/rules-root";

const root = (): string => mkdtempSync(join(tmpdir(), "fh-rules-"));

test("resolveRulesRoot: plugin-root env vars win, in priority order", () => {
  expect(resolveRulesRoot("claude-code", "/cwd", { CLAUDE_PLUGIN_ROOT: "/p/claude" })).toBe("/p/claude");
  expect(resolveRulesRoot("kimi", "/cwd", { KIMI_PLUGIN_ROOT: "/p/kimi" })).toBe("/p/kimi");
  expect(resolveRulesRoot("kimi", "/cwd", { CLAUDE_PLUGIN_ROOT: "/p/claude", KIMI_PLUGIN_ROOT: "/p/kimi" })).toBe("/p/claude");
});

test("resolveRulesRoot: probes the claude marketplace layout", () => {
  const home = root();
  const plugin = join(home, ".claude", "plugins", "marketplaces", "mkt", "plugins", "claude-rules");
  mkdirSync(join(plugin, "rules"), { recursive: true });
  expect(resolveRulesRoot("claude-code", "/cwd", { HOME: home })).toBe(plugin);
});

test("resolveRulesRoot: probes the codex versioned cache, latest version", () => {
  const home = root();
  mkdirSync(join(home, ".codex", "plugins", "cache", "mkt", "codex-rules", "1.0.0", "rules"), { recursive: true });
  const latest = join(home, ".codex", "plugins", "cache", "mkt", "codex-rules", "2.0.0");
  mkdirSync(join(latest, "rules"), { recursive: true });
  expect(resolveRulesRoot("codex", "/cwd", { HOME: home })).toBe(latest);
});

test("resolveRulesRoot: codex cache picks 1.0.23 over 1.0.9 (semver, not lexicographic)", () => {
  const home = root();
  mkdirSync(join(home, ".codex", "plugins", "cache", "mkt", "codex-rules", "1.0.9", "rules"), { recursive: true });
  const latest = join(home, ".codex", "plugins", "cache", "mkt", "codex-rules", "1.0.23");
  mkdirSync(join(latest, "rules"), { recursive: true });
  expect(resolveRulesRoot("codex", "/cwd", { HOME: home })).toBe(latest);
});

test("resolveRulesRoot: probes kimi managed plugins, else falls back to cwd", () => {
  const home = root();
  const plugin = join(home, ".kimi-code", "plugins", "managed", "kimi-rules");
  mkdirSync(join(plugin, "rules"), { recursive: true });
  expect(resolveRulesRoot("kimi", "/cwd", { HOME: home })).toBe(plugin);
  expect(resolveRulesRoot("kimi", "/cwd", { HOME: root() })).toBe("/cwd");
  expect(resolveRulesRoot("hermes", "/cwd", { HOME: root() })).toBe("/cwd");
});
