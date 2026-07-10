import { test, expect } from "bun:test";
import { normalizeEvent } from "../src/runtime/normalize";

test("normalizeEvent: extracts permission_mode when present in the payload", () => {
  const event = normalizeEvent("codex", {
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "ls" },
    session_id: "s",
    permission_mode: "bypassPermissions",
  });
  expect(event.permissionMode).toBe("bypassPermissions");
});

test("normalizeEvent: absent permission_mode stays undefined (no regression on existing payloads)", () => {
  const event = normalizeEvent("claude-code", {
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    tool_input: { file_path: "a.ts" },
    session_id: "s",
  });
  expect(event.permissionMode).toBeUndefined();
});
