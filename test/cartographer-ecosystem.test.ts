import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { generateEcosystemMap } from "../src/runtime/lifecycle/cartographer/ecosystem-map";
import { scanHooks } from "../src/runtime/lifecycle/cartographer/scan-hooks";
import { cartoSessionStart } from "../src/runtime/lifecycle/cartographer/session-start";
import { findMarketplacePlugins } from "../src/runtime/lifecycle/cartographer/detect";

test("generateEcosystemMap: one fake plugin -> index.md with count + agent", () => {
  const plugins = mkdtempSync(join(tmpdir(), "fh-eco-"));
  const plugin = join(plugins, "foo");
  mkdirSync(join(plugin, "agents"), { recursive: true });
  mkdirSync(join(plugin, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(plugin, "agents", "foo.md"),
    "---\nname: foo-agent\ndescription: A foo agent\n---\n# Foo",
  );
  writeFileSync(
    join(plugin, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "foo", version: "1.2.3" }),
  );

  const ctx = generateEcosystemMap(Date.UTC(2026, 5, 25, 12, 0), plugins);
  const indexPath = join(plugins, ".cartographer", "index.md");
  expect(existsSync(indexPath)).toBe(true);
  const index = readFileSync(indexPath, "utf-8");
  expect(index).toContain("Ecosystem Map (1 plugins)");
  expect(index).toContain("foo-agent");
  expect(ctx).toContain("Plugin skills map:");
});

test("scanHooks: array-form hooks.json -> sorted unique event names", () => {
  const plugin = mkdtempSync(join(tmpdir(), "fh-hooks-arr-"));
  mkdirSync(join(plugin, "hooks"), { recursive: true });
  writeFileSync(
    join(plugin, "hooks", "hooks.json"),
    JSON.stringify({
      hooks: [
        { event: "PostToolUse", command: "a" },
        { event: "SessionStart", command: "b" },
        { event: "SessionStart", command: "c" },
        { command: "no-event" },
      ],
    }),
  );
  expect(scanHooks(plugin)).toEqual([["hooks", "PostToolUse, SessionStart", ""]]);
});

test("scanHooks: object-form hooks.json -> event keys (skips _meta)", () => {
  const plugin = mkdtempSync(join(tmpdir(), "fh-hooks-obj-"));
  mkdirSync(join(plugin, "hooks"), { recursive: true });
  writeFileSync(
    join(plugin, "hooks", "hooks.json"),
    JSON.stringify({ _description: "x", hooks: { SessionStart: [], PostToolUse: [] } }),
  );
  expect(scanHooks(plugin)).toEqual([["hooks", "PostToolUse, SessionStart", ""]]);
});

test("findMarketplacePlugins: harness-agnostic config dir (codex -> .codex)", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-home-"));
  const plugins = join(home, ".codex", "plugins", "marketplaces", "m", "plugins");
  mkdirSync(join(plugins, "cartographer"), { recursive: true });
  expect(findMarketplacePlugins(home, "codex")).toBe(plugins);
  // No `.claude` tree exists -> a hardcoded-Claude impl would miss it.
  expect(findMarketplacePlugins(home, "claude-code")).toBe(process.cwd());
});

test("cartoSessionStart: honors CLAUDE_PLUGIN_ROOT override (env /..)", () => {
  const plugins = mkdtempSync(join(tmpdir(), "fh-env-"));
  const plugin = join(plugins, "foo");
  mkdirSync(join(plugin, "agents"), { recursive: true });
  writeFileSync(join(plugin, "agents", "foo.md"), "---\nname: foo-agent\n---\n# Foo");
  const cwd = mkdtempSync(join(tmpdir(), "fh-env-cwd-"));

  const prev = process.env.CLAUDE_PLUGIN_ROOT;
  process.env.CLAUDE_PLUGIN_ROOT = join(plugins, "cartographer");
  try {
    cartoSessionStart(cwd, Date.UTC(2026, 5, 25, 12, 0));
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
    else process.env.CLAUDE_PLUGIN_ROOT = prev;
  }
  expect(existsSync(join(plugins, ".cartographer", "index.md"))).toBe(true);
});
