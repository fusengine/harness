import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveSkillPath } from "../src/policy/skill-path";

function fakeSkill(pluginsDir: string, pluginDirName: string, skillName: string): void {
  const dir = join(pluginsDir, pluginDirName, "skills", skillName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), "---\nname: x\n---\n# x");
}

test("resolveSkillPath: finds skill under whichever installed plugin actually has it", () => {
  const plugins = mkdtempSync(join(tmpdir(), "fh-skillpath-"));
  fakeSkill(plugins, "shadcn-expert", "react-shadcn");
  expect(resolveSkillPath("react-shadcn", plugins)).toBe(
    join(plugins, "shadcn-expert", "skills", "react-shadcn", "SKILL.md"),
  );
});

test("resolveSkillPath: skill absent from every installed plugin -> generic fallback", () => {
  const plugins = mkdtempSync(join(tmpdir(), "fh-skillpath-"));
  fakeSkill(plugins, "react-expert", "solid-react");
  expect(resolveSkillPath("solid-vue", plugins)).toBe(`~/.claude/plugins/marketplaces/fusengine-plugins/plugins/solid-vue`);
});

test("resolveSkillPath: missing plugins dir entirely (CI, no marketplace) -> generic fallback", () => {
  const missing = join(tmpdir(), "fh-skillpath-does-not-exist-" + Date.now());
  expect(resolveSkillPath("solid-react", missing)).toBe(`~/.claude/plugins/marketplaces/fusengine-plugins/plugins/solid-react`);
});
