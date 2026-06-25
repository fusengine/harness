import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { securityAdvisory } from "../src/runtime/lifecycle/security/check-skill";
import { trackSkillRead } from "../src/runtime/lifecycle/security/track-skill-read";
import { trackMcpResearch } from "../src/runtime/lifecycle/security/track-mcp";
import { securityStatePath } from "../src/runtime/lifecycle/security/skill-state";
import { trackWatchResearch } from "../src/runtime/lifecycle/changelog-research";

const NOW = Date.UTC(2026, 5, 25, 12, 0, 0);
const home = (): string => mkdtempSync(join(tmpdir(), "fh-sec-"));

test("securityAdvisory: allow + advisory for code file with no state", () => {
  const h = home();
  const out = securityAdvisory("Write", "foo.ts", NOW, h);
  const parsed = JSON.parse(out) as { hookSpecificOutput: { permissionDecision: string; additionalContext: string } };
  expect(parsed.hookSpecificOutput.permissionDecision).toBe("allow");
  expect(parsed.hookSpecificOutput.additionalContext).toContain("SECURITY:");
});

test("securityAdvisory: empty when skill already read", () => {
  const h = home();
  trackSkillRead("Read", "skills/security-scan/references/scan-patterns.md", NOW, h);
  expect(securityAdvisory("Write", "foo.ts", NOW, h)).toBe("");
});

test("securityAdvisory: empty for non-code file", () => {
  expect(securityAdvisory("Write", "README.md", NOW, home())).toBe("");
});

test("trackSkillRead: sets skill_read=true", () => {
  const h = home();
  trackSkillRead("Read", "x/skills/security-scan/foo.md", NOW, h);
  const state = JSON.parse(readFileSync(securityStatePath(NOW, h), "utf-8")) as { skill_read: boolean; reads: unknown[] };
  expect(state.skill_read).toBe(true);
  expect(state.reads.length).toBe(1);
});

test("trackMcpResearch: appends research entry", () => {
  const h = home();
  trackMcpResearch("mcp__context7__query-docs", { query: "csp headers" }, NOW, h);
  const state = JSON.parse(readFileSync(securityStatePath(NOW, h), "utf-8")) as { research: Array<{ query: string }> };
  expect(state.research[0]?.query).toBe("csp headers");
});

test("trackWatchResearch: writes 00-changelog research log", () => {
  const h = home();
  trackWatchResearch("mcp__exa__web_search_exa", { query: "claude code changelog" }, NOW, h);
  const path = join(h, ".claude", "logs", "00-changelog", "2026-06-25-research.json");
  expect(existsSync(path)).toBe(true);
  const state = JSON.parse(readFileSync(path, "utf-8")) as { queries: Array<{ query: string }> };
  expect(state.queries[0]?.query).toBe("claude code changelog");
});
