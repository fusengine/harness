import { test, expect } from "bun:test";
import { beforeShellExecution, preToolUse as cursorPreToolUse, afterFileEdit } from "../src/adapters/cursor";
import { preToolUse } from "../src/adapters/cline";
import { beforeTool } from "../src/adapters/gemini";
import { resolveMaxLines } from "../src/config/limits";

const oversized = "x\n".repeat(resolveMaxLines() + 50);

test("cursor: shell deny on git --force, allow safe; edit returns no unsupported fields", () => {
  expect(beforeShellExecution({ command: "git push --force" }).permission).toBe("deny");
  expect(beforeShellExecution({ command: "git status" }).permission).toBe("allow");
  expect(afterFileEdit({ file_path: "a.ts", edits: [{ old_string: "", new_string: "x\n".repeat(250) }] })).toEqual({});
  expect(afterFileEdit({ file_path: "a.ts", edits: [{ old_string: "", new_string: "x" }] })).toEqual({});
});

test("cursor: native shell events share extraction and degrade install asks to deny", () => {
  expect(beforeShellExecution({ command: "npm install", cwd: "/project", sandbox: false }).permission).toBe("deny");
  expect(cursorPreToolUse({ tool_name: "Shell", tool_input: { command: "npm install", working_directory: "/project" } }).permission).toBe("deny");
  expect(cursorPreToolUse({ tool_name: "Shell", tool_input: { command: "git status" } }).permission).toBe("allow");
});

test("cline: cancel on oversized code, pass small", () => {
  expect(preToolUse({ hookName: "PreToolUse", preToolUse: { toolName: "write_to_file", parameters: { path: "a.ts", content: oversized } } }).cancel).toBe(true);
  expect(preToolUse({ preToolUse: { toolName: "write_to_file", parameters: { path: "a.ts", content: "x" } } }).cancel).toBeUndefined();
});

test("gemini: deny destructive command, pass safe", () => {
  expect(beforeTool({ tool_name: "run_shell_command", tool_input: { command: "git reset --hard" } }).decision).toBe("deny");
  expect(beforeTool({ tool_name: "run_shell_command", tool_input: { command: "ls -la" } }).decision).toBeUndefined();
});
