import { expect, test } from "bun:test";
import { motionCall } from "../src/runtime/motion/host";
import { normalizeEvent } from "../src/runtime/normalize";
import { createHash } from "node:crypto";

test("id-less motion commands in different projects have distinct reservation identities", () => {
  for (const id of ["gemini-cli", "cline", "hermes", "cursor"]) {
    const payload = { hook_event_name: "BeforeTool", session_id: "same", tool_name: "Bash", tool_input: { command: "bash render.sh --stage draft" } };
    const event = normalizeEvent("claude-code", payload);
    expect(motionCall(id, payload, event, "/project/a").event.toolUseId).not.toBe(motionCall(id, payload, event, "/project/b").event.toolUseId);
  }
});

test("direct callers without root context retain the legacy fallback identity", () => {
  const command = "bash render.sh --stage draft";
  const payload = { hook_event_name: "BeforeTool", session_id: "same", tool_name: "run_shell_command", tool_input: { command } };
  const expected = `noid:gemini-cli:same:${createHash("sha256").update(command).digest("hex")}`;
  expect(motionCall("gemini-cli", payload, normalizeEvent("gemini-cli", payload)).event.toolUseId).toBe(expected);
});

test("Claude has no phantom Interrupt lifecycle event", () => {
  const payload = { hook_event_name: "Interrupt", session_id: "s" };
  expect(motionCall("claude-code", payload, normalizeEvent("claude-code", payload)).kind).toBe("none");
});

test("native identities retain the exact session-call encoding regardless of project root", () => {
  const payload = { hook_event_name: "PreToolUse", session_id: "a:b", tool_use_id: "c:d", tool_name: "Bash" };
  const event = normalizeEvent("claude-code", payload);
  for (const root of [undefined, "/project/a", "/project/b"]) {
    expect(motionCall("claude-code", payload, event, root).event.toolUseId).toBe('claude-code:["a:b","c:d"]');
  }
});
