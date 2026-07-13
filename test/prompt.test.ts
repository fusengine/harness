import { test, expect } from "bun:test";
import { formatPrompt } from "../src/prompt/types";
import { toClaudeResponse, guard } from "../src/adapters/claude";
import { resolveMaxLines } from "../src/config/limits";

test("formatPrompt: memo block with actions", () => {
  const out = formatPrompt({ kind: "block", title: "X", reason: "because", actions: ["do a", "do b"] });
  expect(out).toContain("[BLOCKED] X");
  expect(out).toContain("because");
  expect(out).toContain("1. do a");
  expect(out).toContain("2. do b");
});

test("toClaudeResponse maps kind -> permissionDecision", () => {
  expect(toClaudeResponse("PreToolUse", { kind: "block", title: "t", reason: "r" })).toContain('"permissionDecision":"deny"');
  expect(toClaudeResponse("PreToolUse", { kind: "ask", title: "t", reason: "r" })).toContain('"permissionDecision":"ask"');
  expect(toClaudeResponse("PreToolUse", { kind: "inform", title: "t", reason: "r" })).toContain("additionalContext");
});

test("guard: small allows, oversized denies with memo, git command denies", () => {
  expect(guard({ tool_name: "Write", tool_input: { file_path: "a.ts", content: "x\ny" } })).toBeNull();
  // Tracks the gate's own resolver (`FUSE_SOLID_MAX_LINES` ?? default) so this
  // fixture stays oversized regardless of the ambient env override.
  const big = guard({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "a.ts", content: "x\n".repeat(resolveMaxLines() + 50) } });
  expect(big).toContain('"permissionDecision":"deny"');
  expect(big).toContain("[BLOCKED] SOLID file-size limit");
  const git = guard({ tool_name: "Bash", tool_input: { command: "git push --force" } });
  expect(git).toContain("Destructive git");
});
