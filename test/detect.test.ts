import { test, expect } from "bun:test";
import { detectHarness, detectMode, modeFor } from "../src/detect/harness";

test("detects claude-code via CLAUDECODE (hook mode)", () => {
  const r = detectHarness({ CLAUDECODE: "1" });
  expect(r.id).toBe("claude-code");
  expect(r.mode).toBe("hook");
  expect(r.via).toBe("env");
});

test("AGENT standard takes priority over tool var", () => {
  expect(detectHarness({ AGENT: "goose", CLAUDECODE: "1" }).id).toBe("goose");
});

test("codex via CODEX_SANDBOX presence (value ignored)", () => {
  expect(detectHarness({ CODEX_SANDBOX: "seatbelt" }).id).toBe("codex");
});

test("aider detected and is cli-mode (no native hooks)", () => {
  const r = detectHarness({ AIDER: "1" });
  expect(r.id).toBe("aider");
  expect(r.mode).toBe("cli");
});

test("cursor / cline / gemini / opencode are hook-mode", () => {
  for (const id of ["cursor", "cline", "gemini-cli", "opencode"] as const) {
    expect(modeFor(id)).toBe("hook");
  }
});

test("unknown env -> fallback / cli", () => {
  const r = detectHarness({});
  expect(r.id).toBe("unknown");
  expect(r.mode).toBe("cli");
  expect(r.via).toBe("fallback");
});

test("detectMode convenience", () => {
  expect(detectMode({ CURSOR_AGENT: "1" })).toBe("hook");
  expect(detectMode({})).toBe("cli");
});
