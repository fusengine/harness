import { test, expect } from "bun:test";
import { isReleaseMetadataPath } from "../src/policy/release-metadata-path";
import { shadcnSkillGate } from "../src/policy/shadcn-skill-gate";
import { skillTriggerGate } from "../src/policy/skill-triggers";

const BASE_SKILL = "~/.claude/plugins/marketplaces/x/plugins/shadcn-expert/skills/shadcn-detection/SKILL.md";

test("isReleaseMetadataPath: exactly the closed list, any depth, either separator", () => {
  for (const p of [
    "plugins/shadcn-expert/.claude-plugin/plugin.json",
    "/abs/repo/plugins/shadcn-expert/.claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    "./.claude-plugin/marketplace.json",
    "/abs/repo/.claude-plugin/marketplace.json",
    "CHANGELOG.md",
    "/abs/repo/plugins/shadcn-expert/CHANGELOG.md",
    "C:\\repo\\plugins\\shadcn-expert\\.claude-plugin\\plugin.json",
    "C:\\repo\\CHANGELOG.md",
  ]) expect(isReleaseMetadataPath(p)).toBe(true);
});

test("isReleaseMetadataPath: nothing outside the closed list is exempt", () => {
  for (const p of [
    "plugins/shadcn-expert/.claude-plugin/hooks.json",
    "plugins/shadcn-expert/plugin.json",
    "marketplace.json",
    "x.claude-plugin/plugin.json",
    ".claude-plugin/sub/plugin.json",
    ".claude-plugin/plugin.json.bak",
    "package.json",
    "README.md",
    "changelog.md",
    "Changelog.md",
    "OLD-CHANGELOG.md",
    "CHANGELOG.mdx",
    "CHANGELOG.md/x.ts",
    "plugins/shadcn-expert/components/ui/button.tsx",
    "plugins/shadcn-expert/skills/shadcn-components/SKILL.md",
    "",
  ]) expect(isReleaseMetadataPath(p)).toBe(false);
});

test("shadcnSkillGate: release metadata under a shadcn path skips all three phases", () => {
  const p = "plugins/shadcn-expert/.claude-plugin/plugin.json";
  expect(shadcnSkillGate("Edit", p, '"version": "1.0.18"', { refsRead: [], sessionId: "m1" })).toBeNull();
  expect(shadcnSkillGate("Edit", p, '"version": "1.0.18"', { refsRead: [BASE_SKILL], sessionId: "m2" })).toBeNull();
  expect(shadcnSkillGate("Write", "fuse-ui/.claude-plugin/marketplace.json", "{}", { refsRead: [], sessionId: "m3" })).toBeNull();
});

test("shadcnSkillGate: a sibling .json that is not release metadata keeps its deny", () => {
  const p = shadcnSkillGate("Edit", "plugins/shadcn-expert/.claude-plugin/hooks.json", "{}", { refsRead: [BASE_SKILL], sessionId: "m4" });
  expect(p?.reason).toContain("No MCP research done for shadcn");
});

test("skillTriggerGate: forced arch skill is skipped for release metadata only", () => {
  expect(skillTriggerGate("generic", "", [], "fusecore", undefined, "CHANGELOG.md")).toBeNull();
  expect(skillTriggerGate("generic", "", [], "solid-nextjs", undefined, ".claude-plugin/plugin.json")).toBeNull();
  expect(skillTriggerGate("generic", "", [], "fusecore", undefined, "README.md")?.title).toBe("FuseCore skill not consulted");
  expect(skillTriggerGate("generic", "", [], "fusecore")?.title).toBe("FuseCore skill not consulted");
});
