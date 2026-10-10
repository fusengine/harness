import { expect, test } from "bun:test";
import { motionCall } from "../src/runtime/motion/host";
import { normalizeEvent } from "../src/runtime/normalize";

/** Composed reservation key for one Claude-shaped PreToolUse call. */
function nativeKey(sessionId: string, toolUseId: string): string | undefined {
  const payload = { hook_event_name: "PreToolUse", session_id: sessionId, tool_use_id: toolUseId, tool_name: "Bash", tool_input: { command: "bun render.ts --stage draft" } };
  return motionCall("claude-code", payload, normalizeEvent("claude-code", payload)).event.toolUseId;
}

/** Composed fallback key for one gemini-cli call (no native id). */
function fallbackKey(sessionId: string, command: string): string | undefined {
  const payload = { hook_event_name: "BeforeTool", session_id: sessionId, tool_name: "run_shell_command", tool_input: { command } };
  return motionCall("gemini-cli", payload, normalizeEvent("gemini-cli", payload)).event.toolUseId;
}

test("distinct (session, call) pairs containing ':' never share a reservation key", () => {
  expect(nativeKey("a:b", "c")).not.toBe(nativeKey("a", "b:c"));
  expect(nativeKey("a:", "b")).not.toBe(nativeKey("a", ":b"));
  expect(nativeKey("", "a:b")).not.toBe(nativeKey("a", "b"));
  expect(nativeKey("s", "t")).toBe(nativeKey("s", "t"));
});

test("native and fallback keys stay disjoint and the fallback keeps its noid: prefix", () => {
  const fallback = fallbackKey("a:b", "bun render.ts --stage draft");
  expect(fallback?.startsWith("noid:")).toBe(true);
  expect(fallbackKey("a", "x")).not.toBe(fallbackKey("a:b", "x"));
  expect(nativeKey("noid", "x")?.startsWith("noid:")).toBe(false);
});
