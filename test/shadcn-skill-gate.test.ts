import { test, expect } from "bun:test";
import { isShadcnWrite, shadcnBaseSkillRead, shadcnMcpConsulted, shadcnSkillGate } from "../src/policy/shadcn-skill-gate";
import { SHADCN_TRIGGERS } from "../src/policy/skill-patterns/shadcn-subskills";

const BASE_SKILL = "~/.claude/plugins/marketplaces/x/plugins/shadcn-expert/skills/shadcn-detection/SKILL.md";
const CSS_PATH = "src/components/ui/globals.css";

test("isShadcnWrite: components/ui/shadcn paths in tsx/jsx/css/scss/json, not elsewhere", () => {
  expect(isShadcnWrite("Write", "src/components/ui/button.tsx")).toBe(true);
  expect(isShadcnWrite("Write", "components.json")).toBe(true);
  expect(isShadcnWrite("Edit", CSS_PATH)).toBe(true);
  expect(isShadcnWrite("Write", "src/lib/util.ts")).toBe(false);
  expect(isShadcnWrite("Write", "node_modules/ui/button.tsx")).toBe(false);
  expect(isShadcnWrite("Read", "src/components/ui/button.tsx")).toBe(false);
});

test("shadcnBaseSkillRead: matches only shadcn-detection/shadcn-components", () => {
  expect(shadcnBaseSkillRead([BASE_SKILL])).toBe(true);
  expect(shadcnBaseSkillRead(["skills/shadcn-components/SKILL.md"])).toBe(true);
  expect(shadcnBaseSkillRead(["skills/react-19/SKILL.md"])).toBe(false);
  expect(shadcnBaseSkillRead([])).toBe(false);
});

test("shadcnSkillGate: blocks without base skill read", () => {
  const p = shadcnSkillGate("Write", CSS_PATH, "", { refsRead: [], sessionId: "s1" });
  expect(p?.kind).toBe("block");
  expect(p?.reason).toContain("shadcn skill not consulted");
});

test("shadcnSkillGate: blocks on missing domain sub-skill (theming)", () => {
  const content = ":root { --primary: oklch(0.5 0.2 250); }";
  const p = shadcnSkillGate("Write", CSS_PATH, content, { refsRead: [BASE_SKILL], sessionId: "s2" });
  expect(p?.kind).toBe("block");
  expect(p?.reason).toContain("shadcn-theming");
});

test("shadcnSkillGate: blocks without doc research once the domain skill is read", () => {
  const refsRead = [BASE_SKILL, "skills/shadcn-theming/SKILL.md"];
  const content = ":root { --primary: oklch(0.5 0.2 250); }";
  const p = shadcnSkillGate("Write", CSS_PATH, content, { refsRead, sessionId: "s3" });
  expect(p?.kind).toBe("block");
  expect(p?.reason).toContain("MCP research");
});

test("shadcnSkillGate: allows once base skill + domain skill + doc research are all satisfied", () => {
  const refsRead = [BASE_SKILL, "skills/shadcn-theming/SKILL.md"];
  const content = ":root { --primary: oklch(0.5 0.2 250); }";
  const authorizations = {
    shadcn: { sources: ["mcp__context7__query-docs", "mcp__exa__web_search_exa"], doc_sessions: ["s4"] },
  };
  const p = shadcnSkillGate("Write", CSS_PATH, content, { refsRead, sessionId: "s4", authorizations });
  expect(p).toBeNull();
});

test("shadcnMcpConsulted: matches a recorded shadcn-mcp source for the same session only", () => {
  const auths = { react: { sources: ["shadcn-mcp"], doc_sessions: ["sMcp"] } };
  expect(shadcnMcpConsulted(auths, "sMcp")).toBe(true);
  // wrong session -> not consulted
  expect(shadcnMcpConsulted(auths, "other")).toBe(false);
  // legacy single `source` field is honored too
  expect(shadcnMcpConsulted({ react: { source: "shadcn-mcp", doc_sessions: ["sMcp"] } }, "sMcp")).toBe(true);
  // non-shadcn sources / undefined authorizations -> not consulted (no throw)
  expect(shadcnMcpConsulted({ react: { sources: ["context7"], doc_sessions: ["sMcp"] } }, "sMcp")).toBe(false);
  expect(shadcnMcpConsulted(undefined, "sMcp")).toBe(false);
});

test("shadcnSkillGate: a live mcp__shadcn__* call (source shadcn-mcp) unblocks Phase 1 without a base-skill read", () => {
  // No shadcn-detection/shadcn-components ref is read — Phase 1 is satisfied ONLY
  // by the recorded mcp call (the new 3rd unblock option). Phase 2 (domain skill)
  // and Phase 3 (Context7+Exa) are satisfied as in the "allows" test above.
  const refsRead = ["skills/shadcn-theming/SKILL.md"];
  expect(shadcnBaseSkillRead(refsRead)).toBe(false);
  const content = ":root { --primary: oklch(0.5 0.2 250); }";
  const authorizations = {
    react: {
      sources: ["shadcn-mcp", "mcp__context7__query-docs", "mcp__exa__web_search_exa"],
      doc_sessions: ["sMcp"],
    },
  };
  const p = shadcnSkillGate("Write", CSS_PATH, content, { refsRead, sessionId: "sMcp", authorizations });
  expect(p).toBeNull();
});

test("shadcnSkillGate: non-shadcn-scoped write is allowed", () => {
  expect(shadcnSkillGate("Write", "src/index.ts", "x", { refsRead: [], sessionId: "s5" })).toBeNull();
});

test("SHADCN_TRIGGERS: 5 sub-skills, every pattern compiles and matches its intended sample", () => {
  expect(Object.keys(SHADCN_TRIGGERS).sort()).toEqual(
    ["shadcn-components", "shadcn-detection", "shadcn-migration", "shadcn-registries", "shadcn-theming"].sort(),
  );
  for (const patterns of Object.values(SHADCN_TRIGGERS)) {
    for (const p of patterns) expect(() => new RegExp(p, "i")).not.toThrow();
  }
  expect(new RegExp(SHADCN_TRIGGERS["shadcn-registries"]![0]!, "i").test("mcp__shadcn__search_items_in_registries")).toBe(true);
  expect(new RegExp(SHADCN_TRIGGERS["shadcn-migration"]![1]!, "i").test("migrate from radix to base-ui")).toBe(true);
});
