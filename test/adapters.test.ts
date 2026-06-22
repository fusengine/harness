import { test, expect } from "bun:test";
import { beforeShellExecution, afterFileEdit } from "../src/adapters/cursor";
import { preToolUse } from "../src/adapters/cline";
import { beforeTool } from "../src/adapters/gemini";

const oversized = "x\n".repeat(150);

test("cursor: shell deny on git --force, allow safe; edit observe-only", () => {
  expect(beforeShellExecution({ command: "git push --force" }).permission).toBe("deny");
  expect(beforeShellExecution({ command: "git status" }).permission).toBe("allow");
  expect(afterFileEdit({ file_path: "a.ts", edits: [{ old_string: "", new_string: oversized }] }).violation).toContain("max");
});

test("cline: cancel on oversized code, pass small", () => {
  expect(preToolUse({ hookName: "PreToolUse", preToolUse: { toolName: "write_to_file", parameters: { path: "a.ts", content: oversized } } }).cancel).toBe(true);
  expect(preToolUse({ preToolUse: { toolName: "write_to_file", parameters: { path: "a.ts", content: "x" } } }).cancel).toBeUndefined();
});

test("gemini: deny destructive command, pass safe", () => {
  expect(beforeTool({ tool_name: "run_shell_command", tool_input: { command: "git reset --hard" } }).decision).toBe("deny");
  expect(beforeTool({ tool_name: "run_shell_command", tool_input: { command: "ls -la" } }).decision).toBeUndefined();
});
