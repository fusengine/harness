import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { handleHook, type HandleOptions } from "../src/runtime/handle";
import { normalizeEvent } from "../src/runtime/normalize";
import { respond } from "../src/runtime/respond";

const root = (): string => mkdtempSync(join(tmpdir(), "fh-h-"));
const post = (sid: string, tool: string, input?: Record<string, unknown>) =>
  ({ hook_event_name: "PostToolUse", session_id: sid, tool_name: tool, tool_input: input, tool_response: "x".repeat(600) });

test("normalizeEvent: claude pre/post + cline nesting", () => {
  expect(normalizeEvent("claude-code", { hook_event_name: "PostToolUse", tool_name: "Read", tool_input: { file_path: "a.md" }, session_id: "s" }).phase).toBe("post");
  const c = normalizeEvent("cline", { preToolUse: { toolName: "write_to_file", parameters: { path: "a.ts", content: "x" } }, taskId: "t" });
  expect(c.phase).toBe("pre");
  expect(c.tool).toBe("write_to_file");
  expect(c.filePath).toBe("a.ts");
});

test("respond: native block shape per harness", () => {
  const p = { kind: "block", title: "t", reason: "r" } as const;
  expect(JSON.parse(respond("claude-code", p)).hookSpecificOutput.permissionDecision).toBe("deny");
  expect(JSON.parse(respond("gemini-cli", p)).decision).toBe("deny");
  expect(JSON.parse(respond("cline", p)).cancel).toBe(true);
  expect(JSON.parse(respond("cursor", p)).permission).toBe("deny");
});

test("handleHook: full pre/post loop drives the gates", async () => {
  const cwd = root();
  const opts: HandleOptions = { now: 5000, cwd };
  const edit = { hook_event_name: "PreToolUse", session_id: "s1", tool_name: "Write", tool_input: { file_path: "a.ts", content: "a\nb\nc\nd\ne\nf" } };

  expect((await handleHook("claude-code", edit, opts)).stdout).toContain("explore");

  await handleHook("claude-code", post("s1", "Task", { subagent_type: "x:explore-codebase" }), { now: 4000, cwd });
  await handleHook("claude-code", post("s1", "Task", { subagent_type: "x:research-expert" }), { now: 4500, cwd });
  expect((await handleHook("claude-code", edit, opts)).stdout).toContain("documentation");

  await handleHook("claude-code", post("s1", "mcp__context7__query-docs"), { now: 4600, cwd });
  await handleHook("claude-code", post("s1", "mcp__exa__web_search_exa"), { now: 4700, cwd });
  // Every gate now clears: the compliance notice fires ONCE, on this first passing Write
  // (pre-allow.ts freshEvidenceNotice) — the user-visible confirmation for a gate that,
  // until now, only ever spoke up when it blocked.
  const out = JSON.parse((await handleHook("claude-code", edit, opts)).stdout) as { systemMessage?: string };
  expect(out.systemMessage).toBe("✓ evidence fresh — explore+research");
});
