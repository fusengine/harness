import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { coreGuardsWired } from "../src/runtime/core-guards-wired";

const home = (): string => mkdtempSync(join(tmpdir(), "fh-cgw-"));

/** Claude layout: marketplace copy + settings.json with the given enabledPlugins map. */
function claudeHome(enabledPlugins: Record<string, boolean>): string {
  const h = home();
  mkdirSync(join(h, ".claude", "plugins", "marketplaces", "mkt", "plugins", "core-guards"), { recursive: true });
  writeFileSync(join(h, ".claude", "settings.json"), JSON.stringify({ enabledPlugins }));
  return h;
}

test("claude: required core, no enabledPlugins entry + marketplace copy -> wired", () => {
  expect(coreGuardsWired("claude-code", {}, claudeHome({ "other@mkt": true }))).toBe(true);
});

test("claude: installed but explicitly disabled -> NOT wired (solid must fire)", () => {
  expect(coreGuardsWired("claude-code", {}, claudeHome({ "core-guards@mkt": false }))).toBe(false);
});

test("claude: unreadable/missing settings -> NOT wired (safe default)", () => {
  const h = home();
  mkdirSync(join(h, ".claude", "plugins", "marketplaces", "mkt", "plugins", "core-guards"), { recursive: true });
  expect(coreGuardsWired("claude-code", {}, h)).toBe(false);
});

test("codex: enabled = true -> wired; false or missing section -> NOT wired", () => {
  const on = home();
  mkdirSync(join(on, ".codex"), { recursive: true });
  writeFileSync(join(on, ".codex", "config.toml"), '[plugins."core-guards@mkt"]\nenabled = true\n');
  expect(coreGuardsWired("codex", {}, on)).toBe(true);
  const off = home();
  mkdirSync(join(off, ".codex"), { recursive: true });
  writeFileSync(join(off, ".codex", "config.toml"), '[plugins."core-guards@mkt"]\nenabled = false\n');
  expect(coreGuardsWired("codex", {}, off)).toBe(false);
  expect(coreGuardsWired("codex", {}, home())).toBe(false);
});

test("codex: a commented-out one-line trap `# [plugins.\"core-guards@mkt\"] enabled = true` -> NOT wired", () => {
  const h = home();
  mkdirSync(join(h, ".codex"), { recursive: true });
  writeFileSync(join(h, ".codex", "config.toml"), '# [plugins."core-guards@mkt"] enabled = true\n');
  expect(coreGuardsWired("codex", {}, h)).toBe(false);
});

test("codex: real section with `enabled` commented out in its body -> NOT wired", () => {
  const h = home();
  mkdirSync(join(h, ".codex"), { recursive: true });
  writeFileSync(join(h, ".codex", "config.toml"), '[plugins."core-guards@mkt"]\n# enabled = true\n');
  expect(coreGuardsWired("codex", {}, h)).toBe(false);
});

test("kimi: installed.json entry enabled/not-disabled -> wired; absent -> NOT wired", () => {
  const h = home();
  const root = join(h, ".kimi-code");
  mkdirSync(join(root, "plugins"), { recursive: true });
  writeFileSync(join(root, "plugins", "installed.json"), JSON.stringify({ plugins: { "core-guards": { enabled: true } } }));
  expect(coreGuardsWired("kimi", { HOME: h })).toBe(true);
  writeFileSync(join(root, "plugins", "installed.json"), JSON.stringify({ plugins: { "core-guards": { enabled: false } } }));
  expect(coreGuardsWired("kimi", { HOME: h })).toBe(false);
  expect(coreGuardsWired("kimi", { HOME: home() })).toBe(false);
});

test("other harnesses: never wired", () => {
  expect(coreGuardsWired("hermes", {}, home())).toBe(false);
  expect(coreGuardsWired("cursor", {}, home())).toBe(false);
});
