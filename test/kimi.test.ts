import { test, expect } from "bun:test";
import { HOME_DIR } from "../src/config/dotenv";
import { detectHarness, modeFor } from "../src/detect/harness";
import { guard, toKimiResponse } from "../src/adapters/kimi";
import { respond } from "../src/runtime/respond";
import { resolveMaxLines } from "../src/config/limits";

// Tracks the gate's own resolver so this fixture stays oversized regardless
// of the ambient env override (parity with apexauth-hermes.test.ts).
const oversized = "x\n".repeat(resolveMaxLines() + 50);

test("dotenv: kimi home dir is ~/.kimi-code", () => {
  expect(HOME_DIR.kimi).toBe(".kimi-code");
});

test("detect: AGENT=kimi standard -> kimi, hook mode", () => {
  const r = detectHarness({ AGENT: "kimi" });
  expect(r.id).toBe("kimi");
  expect(r.mode).toBe("hook");
  expect(r.via).toBe("agent-std");
  expect(modeFor("kimi")).toBe("hook");
});

test("kimi guard: oversized Write blocks", () => {
  const out = guard({ tool_name: "Write", tool_input: { file_path: "a.ts", content: oversized } });
  expect(out).not.toBeNull();
  const parsed = JSON.parse(out ?? "{}");
  expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
  expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain("BLOCKED");
});

test("kimi guard: safe Bash and small Write pass (null = allow)", () => {
  expect(guard({ tool_name: "Bash", tool_input: { command: "ls -la" } })).toBeNull();
  expect(guard({ tool_name: "Write", tool_input: { file_path: "a.ts", content: "x" } })).toBeNull();
});

test("kimi guard: real Kimi Write payload (path, no file_path) blocks on oversized content", () => {
  const out = guard({ tool_name: "Write", tool_input: { path: "cart.ts", content: oversized } });
  expect(out).not.toBeNull();
  const parsed = JSON.parse(out ?? "{}");
  expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
  expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain("BLOCKED");
});

test("kimi guard: path takes precedence over file_path when both are present and differ", () => {
  const withPath = guard({
    tool_name: "Write",
    tool_input: { path: "blocked.ts", file_path: "allowed.ts", content: oversized },
  });
  expect(withPath).not.toBeNull();
  const parsed = JSON.parse(withPath ?? "{}");
  expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain("blocked.ts");
  expect(parsed.hookSpecificOutput.permissionDecisionReason).not.toContain("allowed.ts");
});

test("kimi guard: destructive git via Bash denies", () => {
  const out = guard({ tool_name: "Bash", tool_input: { command: "git push origin main --force" } });
  const parsed = JSON.parse(out ?? "{}");
  expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
});

test("kimi response: block -> exact camelCase hookSpecificOutput.permissionDecision:deny", () => {
  const out = toKimiResponse({ kind: "block", title: "t", reason: "r" });
  const parsed = JSON.parse(out);
  expect(Object.keys(parsed)).toEqual(["hookSpecificOutput"]);
  expect(Object.keys(parsed.hookSpecificOutput).sort()).toEqual(["permissionDecision", "permissionDecisionReason"]);
  expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
  expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain("BLOCKED");
});

test("kimi response: ask downgrades to deny with the no-interactive-approval prefix", () => {
  const out = respond("kimi", { kind: "ask", title: "t", reason: "r" });
  const parsed = JSON.parse(out);
  expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
  expect(parsed.hookSpecificOutput.permissionDecisionReason).toStartWith("[downgraded from ask — Kimi Code has no interactive approval]");
});

test("kimi response: inform is raw text, never JSON with hookSpecificOutput", () => {
  const out = respond("kimi", { kind: "inform", title: "t", reason: "r" });
  expect(out).toContain("[NOTE]");
  expect(() => {
    const parsed = JSON.parse(out) as Record<string, unknown>;
    if ("hookSpecificOutput" in parsed) throw new Error("inform must not carry hookSpecificOutput");
  }).toThrow();
});

test("kimi response: allow (guard null) resolves to empty stdout downstream", () => {
  expect(guard({ tool_name: "Bash", tool_input: { command: "ls" } })).toBeNull();
});
