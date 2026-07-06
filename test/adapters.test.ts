import { test, expect } from "bun:test";
import { beforeShellExecution, afterFileEdit } from "../src/adapters/cursor";
import { preToolUse } from "../src/adapters/cline";
import { beforeTool } from "../src/adapters/gemini";

const oversized = "x\n".repeat(150);

test("cursor: shell deny on git --force, allow safe; edit is advisory (user_message only)", () => {
  expect(beforeShellExecution({ command: "git push --force" }).permission).toBe("deny");
  expect(beforeShellExecution({ command: "git status" }).permission).toBe("allow");
  // afterFileEdit is advisory: ALWAYS allow (never a false deny), violation rides user_message.
  const advice = afterFileEdit({ file_path: "a.ts", edits: [{ old_string: "", new_string: oversized }] });
  expect(advice.permission).toBe("allow");
  expect(advice.user_message).toContain("max");
  expect(afterFileEdit({ file_path: "a.ts", edits: [{ old_string: "", new_string: "x" }] }).user_message).toBeUndefined();
});

test("cline: cancel on oversized code, pass small", () => {
  expect(preToolUse({ hookName: "PreToolUse", preToolUse: { toolName: "write_to_file", parameters: { path: "a.ts", content: oversized } } }).cancel).toBe(true);
  expect(preToolUse({ preToolUse: { toolName: "write_to_file", parameters: { path: "a.ts", content: "x" } } }).cancel).toBeUndefined();
});

test("gemini: deny destructive command, pass safe", () => {
  expect(beforeTool({ tool_name: "run_shell_command", tool_input: { command: "git reset --hard" } }).decision).toBe("deny");
  expect(beforeTool({ tool_name: "run_shell_command", tool_input: { command: "ls -la" } }).decision).toBeUndefined();
});
