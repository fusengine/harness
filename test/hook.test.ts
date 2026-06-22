import { test, expect } from "bun:test";
import { dispatchHook } from "../src/cli/hook";

const big = "x\n".repeat(150);

test("dispatchHook routes each harness to its adapter", () => {
  expect(dispatchHook("claude-code", { hook_event_name: "PreToolUse", tool_input: { file_path: "a.ts", content: big } }).stdout).toContain("deny");
  expect(dispatchHook("codex", { hook_event_name: "PreToolUse", tool_input: { command: "git reset --hard" } }).stdout).toContain("deny");
  expect(dispatchHook("cursor", { hook_event_name: "beforeShellExecution", command: "ls" }).stdout).toContain("allow");
  expect((JSON.parse(dispatchHook("cline", { preToolUse: { toolName: "write_to_file", parameters: { path: "a.ts", content: big } } }).stdout) as { cancel?: boolean }).cancel).toBe(true);
  expect((JSON.parse(dispatchHook("gemini-cli", { tool_name: "write_file", tool_input: { path: "a.ts", content: big } }).stdout) as { decision?: string }).decision).toBe("deny");
});

test("dispatchHook: unknown harness is a no-op allow", () => {
  const r = dispatchHook("nope", {});
  expect(r.stdout).toBe("");
  expect(r.exit).toBe(0);
});
