import { test, expect } from "bun:test";
import { classifyCodexOutcome } from "../src/tracking/codex-post-failure";

test("classifyCodexOutcome: non-zero exit code (exit_code / exitCode) -> failure", () => {
  expect(classifyCodexOutcome({ exit_code: 1 })).toBe("failure");
  expect(classifyCodexOutcome({ exitCode: 2 })).toBe("failure");
});

test("classifyCodexOutcome: explicit error signals -> failure", () => {
  expect(classifyCodexOutcome({ error: "boom" })).toBe("failure");
  expect(classifyCodexOutcome({ is_error: true })).toBe("failure");
  expect(classifyCodexOutcome({ success: false })).toBe("failure");
});

test("classifyCodexOutcome: interruption markers -> interrupted", () => {
  expect(classifyCodexOutcome({ is_interrupt: true })).toBe("interrupted");
  expect(classifyCodexOutcome({ aborted: true })).toBe("interrupted");
});

test("classifyCodexOutcome: interruption wins over a non-zero exit", () => {
  expect(classifyCodexOutcome({ exit_code: 130, is_interrupt: true })).toBe("interrupted");
});

test("classifyCodexOutcome: null / non-object / clean result -> success (fail-open)", () => {
  expect(classifyCodexOutcome(null)).toBe("success");
  expect(classifyCodexOutcome("nope")).toBe("success");
  expect(classifyCodexOutcome([1, 2])).toBe("success");
  expect(classifyCodexOutcome({ exit_code: 0 })).toBe("success");
});
