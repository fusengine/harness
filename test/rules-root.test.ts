import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
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

// --- Non-regression: non-cursor precedence must stay untouched by the
// cursor-only branch added below (CLAUDE_PLUGIN_ROOT is read for ALL
// non-cursor ids before the per-id probe switch — historical quirk, frozen). ---

test("non-regression: CLAUDE_PLUGIN_ROOT still wins for codex/kimi/claude-code/unknown ids", () => {
  expect(resolveRulesRoot("codex", "/cwd", { CLAUDE_PLUGIN_ROOT: "/p/claude" })).toBe("/p/claude");
  expect(resolveRulesRoot("kimi", "/cwd", { CLAUDE_PLUGIN_ROOT: "/p/claude" })).toBe("/p/claude");
  expect(resolveRulesRoot("claude-code", "/cwd", { CLAUDE_PLUGIN_ROOT: "/p/claude" })).toBe("/p/claude");
  expect(resolveRulesRoot("hermes", "/cwd", { CLAUDE_PLUGIN_ROOT: "/p/claude" })).toBe("/p/claude");
});

test("non-regression: KIMI_PLUGIN_ROOT still wins over probing for non-cursor ids when CLAUDE_PLUGIN_ROOT is absent", () => {
  expect(resolveRulesRoot("codex", "/cwd", { KIMI_PLUGIN_ROOT: "/p/kimi" })).toBe("/p/kimi");
  expect(resolveRulesRoot("claude-code", "/cwd", { KIMI_PLUGIN_ROOT: "/p/kimi" })).toBe("/p/kimi");
});

test("non-regression: full precedence order frozen — CLAUDE_PLUGIN_ROOT > KIMI_PLUGIN_ROOT > probe > cwd", () => {
  const home = root();
  const plugin = join(home, ".claude", "plugins", "marketplaces", "mkt", "plugins", "claude-rules");
  mkdirSync(join(plugin, "rules"), { recursive: true });
  // Probe would find `plugin`, but CLAUDE_PLUGIN_ROOT must still win.
  expect(resolveRulesRoot("claude-code", "/cwd", { HOME: home, CLAUDE_PLUGIN_ROOT: "/p/claude" })).toBe("/p/claude");
  // KIMI_PLUGIN_ROOT must still win over the probe hit.
  expect(resolveRulesRoot("claude-code", "/cwd", { HOME: home, KIMI_PLUGIN_ROOT: "/p/kimi" })).toBe("/p/kimi");
  // Neither env set: probe hit wins over cwd.
  expect(resolveRulesRoot("claude-code", "/cwd", { HOME: home })).toBe(plugin);
});

// --- Cursor: separate branch, resolveCursorPluginRoot precedence, stderr diagnostic on fallback. ---

test("resolveRulesRoot: cursor id delegates to resolveCursorPluginRoot (env wins)", () => {
  const dir = root();
  expect(resolveRulesRoot("cursor", "/cwd", { CURSOR_PLUGIN_ROOT: dir })).toBe(realpathSync.native(dir));
  expect(resolveRulesRoot("cursor", "/cwd", { CLAUDE_PLUGIN_ROOT: dir })).toBe(realpathSync.native(dir));
});

test("resolveRulesRoot: cursor id detects a plugin marker in cwd when env is absent", () => {
  const dir = root();
  mkdirSync(join(dir, "hooks"), { recursive: true });
  writeFileSync(join(dir, "hooks", "hooks.json"), "{}");
  expect(resolveRulesRoot("cursor", dir, {})).toBe(realpathSync.native(dir));
});

test("resolveRulesRoot: cursor id falls back to cwd AND writes one stderr diagnostic line when unproven", () => {
  const dir = root();
  const original = process.stderr.write.bind(process.stderr);
  const lines: string[] = [];
  process.stderr.write = ((chunk: string) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    const result = resolveRulesRoot("cursor", dir, {});
    expect(result).toBe(dir);
  } finally {
    process.stderr.write = original;
  }
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain("cursor");
  expect(lines[0]).toContain("no plugin root proven");
  expect(lines[0]).toContain(dir);
});

test("resolveRulesRoot: cursor id does not read KIMI_PLUGIN_ROOT (not part of Cursor's env contract)", () => {
  const dir = root();
  expect(resolveRulesRoot("cursor", dir, { KIMI_PLUGIN_ROOT: "/p/kimi" })).toBe(dir);
});
