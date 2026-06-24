import { test, expect } from "bun:test";
import { runGuards, registerGuard, clearUserGuards, FAIL_CLOSED } from "../src/policy/guards";

test("fail-closed: a throwing guard blocks (never silently passes)", () => {
  clearUserGuards();
  registerGuard(() => {
    throw new Error("boom");
  });
  expect(runGuards({ tool: "Read", filePath: "x.md" })).toEqual(FAIL_CLOSED);
  clearUserGuards();
});

test("registerGuard: user guard runs after the core chain (two-tier)", () => {
  clearUserGuards();
  expect(runGuards({ tool: "Bash", command: "ls" })).toBeNull();
  registerGuard((ctx) => (ctx.command === "ls" ? { kind: "ask", title: "no ls", reason: "house rule" } : null));
  expect(runGuards({ tool: "Bash", command: "ls" })?.kind).toBe("ask");
  clearUserGuards();
  expect(runGuards({ tool: "Bash", command: "ls" })).toBeNull();
});
