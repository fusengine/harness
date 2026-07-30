/**
 * @module test/kimi-notice-only
 * Dedicated unit tests for the kimi notice-only injection (theorem
 * `f'(x) = g(x) if P(x), f(x) otherwise`, `P(x) ≡ id="kimi" ∧
 * event="UserPromptSubmit"`). The golden matrix
 * (`inform-matrix.characterization.test.ts`) proves the fail-safe default
 * (fences absent in its fixture); these tests exercise the fenced-present
 * branch directly, plus the SessionStart/SubagentStart/claude-code
 * non-regression cases.
 */
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rulesInAgentsMd } from "../src/runtime/lifecycle/kimi-rules-native";
import { injectRules } from "../src/runtime/lifecycle/inject-rules";

const FENCED = "<!-- fusengine:kimi-rules:start -->\nbody\n<!-- fusengine:kimi-rules:end -->\n";

/** Build a fixture kimi home dir, optionally with a fenced/unfenced AGENTS.md. */
function kimiHome(root: string, agentsMd?: string): string {
  const home = mkdtempSync(join(root, "kimi-home-"));
  if (agentsMd !== undefined) writeFileSync(join(home, "AGENTS.md"), agentsMd);
  return home;
}

/** Fixture plugin root carrying one rules file, for `injectRules`. */
function pluginRoot(root: string): string {
  const dir = mkdtempSync(join(root, "plugin-"));
  mkdirSync(join(dir, "rules"), { recursive: true });
  writeFileSync(join(dir, "rules", "00.md"), "# rules\nbody\n");
  return dir;
}

describe("rulesInAgentsMd", () => {
  const root = mkdtempSync(join(tmpdir(), "kimi-notice-only-"));

  test("fences present -> true", () => {
    expect(rulesInAgentsMd(kimiHome(root, FENCED))).toBe(true);
  });

  test("fences absent -> false", () => {
    expect(rulesInAgentsMd(kimiHome(root, "# AGENTS.md\nplain body\n"))).toBe(false);
  });

  test("AGENTS.md absent -> false", () => {
    expect(rulesInAgentsMd(kimiHome(root))).toBe(false);
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));
});

describe("injectRules: kimi notice-only gate", () => {
  const root = mkdtempSync(join(tmpdir(), "kimi-notice-only-inject-"));
  const prevKimiHome = process.env.KIMI_CODE_HOME;

  afterEach(() => {
    if (prevKimiHome === undefined) delete process.env.KIMI_CODE_HOME;
    else process.env.KIMI_CODE_HOME = prevKimiHome;
  });

  test("kimi UserPromptSubmit, fences present -> notice only", () => {
    process.env.KIMI_CODE_HOME = kimiHome(root, FENCED);
    expect(injectRules(pluginRoot(root), "UserPromptSubmit", "kimi")).toBe("rules 00-08 injected");
  });

  test("kimi UserPromptSubmit, fences absent -> full corpus", () => {
    process.env.KIMI_CODE_HOME = kimiHome(root, "# AGENTS.md\nplain\n");
    const out = injectRules(pluginRoot(root), "UserPromptSubmit", "kimi");
    expect(out).toContain("# rules\nbody");
    expect(out).toContain("rules 00-08 injected");
  });

  test("kimi SessionStart, fences present -> full corpus (never gated)", () => {
    process.env.KIMI_CODE_HOME = kimiHome(root, FENCED);
    expect(injectRules(pluginRoot(root), "SessionStart", "kimi")).toContain("# rules\nbody");
  });

  test("kimi SubagentStart, fences present -> full corpus (never gated)", () => {
    process.env.KIMI_CODE_HOME = kimiHome(root, FENCED);
    expect(injectRules(pluginRoot(root), "SubagentStart", "kimi")).toContain("# rules\nbody");
  });

  test("claude-code UserPromptSubmit is unaffected by the kimi gate", () => {
    process.env.KIMI_CODE_HOME = kimiHome(root, FENCED);
    const out = injectRules(pluginRoot(root), "UserPromptSubmit", "claude-code");
    expect(out).toContain("additionalContext");
    expect(out).toContain("# rules\\nbody");
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));
});
