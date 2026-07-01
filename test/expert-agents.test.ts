import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getExpertAgent } from "../src/policy/expert-agents";

function fakePlugin(pluginsDir: string, dir: string, pkgName: string, agentFile: string, agentName: string): void {
  const pluginPath = join(pluginsDir, dir);
  mkdirSync(join(pluginPath, "agents"), { recursive: true });
  mkdirSync(join(pluginPath, ".claude-plugin"), { recursive: true });
  writeFileSync(join(pluginPath, "agents", agentFile), `---\nname: ${agentName}\ndescription: d\n---\n# x`);
  writeFileSync(join(pluginPath, ".claude-plugin", "plugin.json"), JSON.stringify({ name: pkgName, version: "1.0.0" }));
}

test("getExpertAgent: matches installed agent name startsWith(type) -> <plugin>:<agent>", () => {
  const plugins = mkdtempSync(join(tmpdir(), "fh-agents-"));
  fakePlugin(plugins, "nextjs-expert", "fuse-nextjs", "nextjs-expert.md", "nextjs-expert");
  expect(getExpertAgent("nextjs", plugins)).toBe("fuse-nextjs:nextjs-expert");
});

test("getExpertAgent: tailwind matches tailwindcss-expert (prefix, not exact)", () => {
  const plugins = mkdtempSync(join(tmpdir(), "fh-agents-"));
  fakePlugin(plugins, "tailwindcss", "fuse-tailwindcss", "tailwindcss-expert.md", "tailwindcss-expert");
  expect(getExpertAgent("tailwind", plugins)).toBe("fuse-tailwindcss:tailwindcss-expert");
});

test("getExpertAgent: no plugin installed for type -> general-purpose (never a fictional id)", () => {
  const plugins = mkdtempSync(join(tmpdir(), "fh-agents-"));
  fakePlugin(plugins, "nextjs-expert", "fuse-nextjs", "nextjs-expert.md", "nextjs-expert");
  expect(getExpertAgent("vue", plugins)).toBe("general-purpose");
});

test("getExpertAgent: missing plugins dir entirely (CI, no marketplace) -> general-purpose", () => {
  expect(getExpertAgent("react", join(tmpdir(), "fh-agents-does-not-exist-" + Date.now()))).toBe("general-purpose");
});

test("getExpertAgent: plugin without plugin.json falls back to dir name as prefix", () => {
  const plugins = mkdtempSync(join(tmpdir(), "fh-agents-"));
  const pluginPath = join(plugins, "react-expert");
  mkdirSync(join(pluginPath, "agents"), { recursive: true });
  writeFileSync(join(pluginPath, "agents", "react-expert.md"), "---\nname: react-expert\n---\n# x");
  expect(getExpertAgent("react", plugins)).toBe("react-expert:react-expert");
});
