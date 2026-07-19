import { test, expect } from "bun:test";
import { CRITICAL_PATTERNS, ASK_PATTERNS } from "../src/policy/guards/security";
import { ALL_RULES, CRITICAL_RULES, ASK_RULES, SKIP_LIST, buildCodexRules } from "../src/codex-rules";

function isCovered(label: string): boolean {
  return ALL_RULES.some((r) => r.sourceLabel === label) || SKIP_LIST.some((s) => s.sourceLabel === label);
}

test("anti-drift: every CRITICAL_PATTERNS label is a prefix_rule or in the skip-list", () => {
  for (const { label } of CRITICAL_PATTERNS) expect(isCovered(label)).toBe(true);
});

test("anti-drift: every ASK_PATTERNS label is a prefix_rule or in the skip-list", () => {
  for (const { label } of ASK_PATTERNS) expect(isCovered(label)).toBe(true);
});

test("anti-drift (reverse, unguarded): every ALL_RULES/SKIP_LIST sourceLabel exists in security.ts", () => {
  const securityLabels = new Set([...CRITICAL_PATTERNS.map((p) => p.label), ...ASK_PATTERNS.map((p) => p.label)]);
  for (const rule of ALL_RULES) {
    expect(securityLabels.has(rule.sourceLabel)).toBe(true);
  }
  for (const entry of SKIP_LIST) {
    expect(securityLabels.has(entry.sourceLabel)).toBe(true);
  }
});

test("CRITICAL_PATTERNS labels never map to a prompt/allow rule, ASK_PATTERNS never to forbidden", () => {
  const criticalLabels = new Set(CRITICAL_PATTERNS.map((p) => p.label));
  const askLabels = new Set(ASK_PATTERNS.map((p) => p.label));
  for (const rule of CRITICAL_RULES) {
    if (criticalLabels.has(rule.sourceLabel)) expect(rule.decision).toBe("forbidden");
  }
  for (const rule of ASK_RULES) {
    if (askLabels.has(rule.sourceLabel)) expect(rule.decision).toBe("prompt");
  }
});

test("every rule has a valid decision, non-empty pattern/justification/match", () => {
  const decisions = new Set(["allow", "prompt", "forbidden"]);
  for (const rule of ALL_RULES) {
    expect(decisions.has(rule.decision)).toBe(true);
    expect(rule.pattern.length).toBeGreaterThan(0);
    expect(rule.justification.length).toBeGreaterThan(0);
    expect(rule.match.length).toBeGreaterThan(0);
  }
});

test("skip-list entries have a non-empty sourceLabel and reason", () => {
  for (const entry of SKIP_LIST) {
    expect(entry.sourceLabel.length).toBeGreaterThan(0);
    expect(entry.reason.length).toBeGreaterThan(0);
  }
});

test("buildCodexRules emits Starlark with header, skip-list comments, and prefix_rule blocks", () => {
  const out = buildCodexRules();
  expect(out).toContain("prefix_rule(");
  expect(out).toContain('decision = "forbidden"');
  expect(out).toContain('decision = "prompt"');
  expect(out).toContain("fork bomb");
  const ruleBlockCount = (out.match(/^prefix_rule\($/gm) ?? []).length;
  expect(ruleBlockCount).toBe(ALL_RULES.length);
});

test("gap-fix coverage: mkfs variants, diskutil case variants, dd downgrade", () => {
  const flat = (r: (typeof ALL_RULES)[number]): string =>
    r.pattern.map((el) => (Array.isArray(el) ? el.join("|") : el)).join(" ");
  const allFlat = ALL_RULES.map(flat);
  expect(allFlat.some((p) => p.includes("mkfs.f2fs"))).toBe(true);
  expect(allFlat.some((p) => p.includes("mkfs.exfat"))).toBe(true);
  expect(allFlat.some((p) => p.includes("ERASEDISK"))).toBe(true);
  const ddRule = ALL_RULES.find((r) => r.sourceLabel === "CRITICAL: Detected dangerous command 'dd if='");
  expect(ddRule?.decision).toBe("prompt");
});

test("gap-fix coverage: chmod 777 flag-order variants (no divergent not_match left)", () => {
  const chmodAsk = ALL_RULES.filter((r) => r.sourceLabel === "DANGEROUS PATTERN: chmod 777");
  const hasOrder = (...tokens: string[]): boolean =>
    chmodAsk.some((r) => r.pattern.length === tokens.length && tokens.every((t, i) => r.pattern[i] === t));
  expect(hasOrder("chmod", "777")).toBe(true);
  expect(hasOrder("chmod", "-R", "777")).toBe(true);
  expect(hasOrder("chmod", "-r", "777")).toBe(true);
  expect(hasOrder("chmod", "-v", "777")).toBe(true);
  const rootRule = ALL_RULES.find(
    (r) => r.sourceLabel === "DANGEROUS PATTERN: chmod 777 on /" && r.pattern[0] === "chmod",
  );
  expect(rootRule?.notMatch ?? []).not.toContain("chmod 777 /tmp/file");
});

test("gap-fix coverage: absolute-path executable aliases mirror bare-name coverage", () => {
  expect(ALL_RULES.some((r) => r.pattern[0] === "/bin/rm" && r.decision === "forbidden")).toBe(true);
  expect(ALL_RULES.some((r) => r.pattern[0] === "/usr/bin/rm" && r.decision === "forbidden")).toBe(true);
  expect(ALL_RULES.some((r) => r.pattern[0] === "/bin/chmod")).toBe(true);
  expect(ALL_RULES.some((r) => r.pattern[0] === "/usr/sbin/diskutil" && r.decision === "forbidden")).toBe(true);
  expect(ALL_RULES.some((r) => r.pattern[0] === "/usr/bin/sudo" && r.decision === "forbidden")).toBe(true);
  expect(ALL_RULES.some((r) => r.pattern[0] === "/bin/dd" && r.decision === "prompt")).toBe(true);
});

test("gap-fix coverage: remote-fetch (curl/wget) rule replaces the bare-shell heuristic", () => {
  const remoteFetchRule = ALL_RULES.find((r) => r.sourceLabel === "DANGEROUS PATTERN: remote script piped to a shell");
  expect(remoteFetchRule).toBeDefined();
  expect(remoteFetchRule?.decision).toBe("prompt");
  const first = remoteFetchRule?.pattern[0];
  expect(Array.isArray(first) ? first : []).toEqual(expect.arrayContaining(["curl", "wget"]));
  // the label moved OUT of the skip-list: it is now covered by a real prefix_rule, not a documented gap
  expect(SKIP_LIST.some((s) => s.sourceLabel === "DANGEROUS PATTERN: remote script piped to a shell")).toBe(false);
  // the former bare-shell heuristic (shell-bare.ts) is fully removed
  expect(ALL_RULES.some((r) => r.pattern[0] === "sh")).toBe(false);
  expect(ALL_RULES.some((r) => r.pattern[0] === "bash")).toBe(false);
  expect(ALL_RULES.some((r) => r.pattern[0] === "zsh")).toBe(false);
  expect(ALL_RULES.some((r) => r.pattern[0] === "/bin/sh")).toBe(false);
  expect(ALL_RULES.some((r) => r.pattern[0] === "/bin/bash")).toBe(false);
});
