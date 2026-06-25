import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { generateEcosystemMap } from "../src/runtime/lifecycle/cartographer/ecosystem-map";

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
