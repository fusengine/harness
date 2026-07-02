import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { formatPrompt } from "../src/prompt/types";
import { respond } from "../src/runtime/respond";
import { handleHook } from "../src/runtime/handle";
import { attachSystemMessage } from "../src/adapters/claude";
import { designPassNotice } from "../src/policy/design/gates";
import { setActiveDesignAgent } from "../src/policy/design/flag";
import { saveDesignState, initDesignState } from "../src/policy/design/state";
import { projectLayout } from "../src/config/layout";

const tmp = (): string => mkdtempSync(join(tmpdir(), "fh-um-"));

/** A design-agent cache with the active flag + a phase-N state for `agentId`. */
function designCache(agentId: string, phase: number, dir = tmp()): string {
  setActiveDesignAgent(dir, agentId);
  const state = initDesignState(agentId, "full", false);
  state.currentPhase = phase;
  state.inspirationRead = true;
  saveDesignState(dir, state);
  return dir;
}

test("designPassNotice: passing design write restores the exact Python allow_pass lines", () => {
  const cache = designCache("ag1", 0);
  const n = designPassNotice({ agentId: "ag1", tool: "Write", filePath: "/p/index.html", content: "<div>", url: "", phase: "pre" }, cache);
  expect(n?.kind).toBe("inform");
  expect(n?.userMessage).toBe("enforce-html-css-only: allowed: index.html\npipeline-gate: phase 0 ok");
  // userMessage is user-only: formatPrompt (the agent memo) never includes it.
  expect(formatPrompt(n!)).not.toContain("enforce-html-css-only");
});

test("designPassNotice: navigate pass carries check-inspiration-read + pipeline-gate; post pass ports post_pass", () => {
  const cache = designCache("ag2", 1);
  const nav = designPassNotice({ agentId: "ag2", tool: "mcp__fuse-browser__browser_navigate", filePath: "", content: "", url: "https://godly.website/x", phase: "pre" }, cache);
  expect(nav?.userMessage).toBe("check-inspiration-read: pass (https://godly.website/x)\npipeline-gate: phase 1 ok");
  const ds = designPassNotice({ agentId: "ag2", tool: "Write", filePath: "/p/design-system.md", content: "", url: "", phase: "post" }, cache);
  expect(ds?.userMessage).toBe("validate-design: design-system.md → phase 3");
  const css = designPassNotice({ agentId: "ag2", tool: "Edit", filePath: "/p/a.css", content: "", url: "", phase: "post" }, cache);
  expect(css?.userMessage).toBe("validate-design: design ok");
});

test("designPassNotice: check-design-skill pass fires for ANY agent; inert outside design context otherwise", () => {
  const cache = tmp(); // no active design flag
  const ui = designPassNotice({ agentId: "", tool: "Write", filePath: "src/components/Button.tsx", content: 'className="flex p-2"', url: "", phase: "pre" }, cache);
  expect(ui?.userMessage).toBe("check-design-skill: pass (domain: 3-generating-components)");
  expect(designPassNotice({ agentId: "", tool: "Write", filePath: "a.ts", content: "x", url: "", phase: "pre" }, cache)).toBeNull();
});

test("respond claude-code: pure pass notice emits the systemMessage channel; a deny stays identical", () => {
  const cache = designCache("ag3", 0);
  const n = designPassNotice({ agentId: "ag3", tool: "Write", filePath: "/p/a.css", content: "", url: "", phase: "pre" }, cache)!;
  const out = JSON.parse(respond("claude-code", n)) as Record<string, unknown>;
  expect(out.systemMessage).toBe("enforce-html-css-only: allowed: a.css\npipeline-gate: phase 0 ok");
  expect(out.hookSpecificOutput).toBeUndefined(); // pure pass: {systemMessage} alone (allow)
  const deny = JSON.parse(respond("claude-code", { kind: "block", title: "t", reason: "r" })) as { hookSpecificOutput: Record<string, unknown>; systemMessage?: string };
  expect(deny.hookSpecificOutput.permissionDecision).toBe("deny");
  expect(deny.systemMessage).toBeUndefined();
});

test("respond: inform with BOTH reason and userMessage merges agent context + user notice (validate-design parity)", () => {
  const p = { kind: "inform", title: "Design review", reason: "warn A", userMessage: "validate-design: design ok" } as const;
  const out = JSON.parse(respond("claude-code", p)) as { systemMessage: string; hookSpecificOutput: { additionalContext: string } };
  expect(out.systemMessage).toBe("validate-design: design ok");
  expect(out.hookSpecificOutput.additionalContext).toContain("warn A");
});

test("respond: per-harness user channel — gemini systemMessage, cursor user_message, cline drops without crashing", () => {
  const n = { kind: "inform", title: "Design pipeline", reason: "", userMessage: "pipeline-gate: phase 0 ok" } as const;
  // Gemini CLI supports the common `systemMessage` output field (shown in terminal).
  expect(JSON.parse(respond("gemini-cli", n))).toEqual({ systemMessage: "pipeline-gate: phase 0 ok" });
  // Cline has no user-visible channel: pure notice is a silent allow.
  expect(respond("cline", n)).toBe("");
  const cursor = JSON.parse(respond("cursor", n)) as Record<string, unknown>;
  expect(cursor.permission).toBe("allow");
  expect(cursor.user_message).toBe("pipeline-gate: phase 0 ok"); // snake_case — camelCase silently ignored (#141516)
  expect(cursor.userMessage).toBeUndefined();
  expect(cursor.agent_message).toBeUndefined(); // pure notice: nothing agent-facing
});

test("attachSystemMessage: merges into rendered stdout; falls back to systemMessage alone on garbage", () => {
  const merged = JSON.parse(attachSystemMessage('{"hookSpecificOutput":{"additionalContext":"c"}}', "n")) as Record<string, unknown>;
  expect(merged.systemMessage).toBe("n");
  expect((merged.hookSpecificOutput as Record<string, unknown>).additionalContext).toBe("c");
  expect(JSON.parse(attachSystemMessage("not-json", "n"))).toEqual({ systemMessage: "n" });
});

test("handleHook e2e: a PASSING design-agent navigate emits the user notice on claude-code stdout", async () => {
  const cwd = tmp();
  designCache("agE", 1, projectLayout(cwd).cacheDir);
  const payload = { hook_event_name: "PreToolUse", session_id: "sE", agent_id: "agE", tool_name: "mcp__fuse-browser__browser_navigate", tool_input: { url: "https://godly.website/site" } };
  const out = await handleHook("claude-code", payload, { now: 5000, cwd });
  expect((JSON.parse(out.stdout) as Record<string, unknown>).systemMessage).toBe("check-inspiration-read: pass (https://godly.website/site)\npipeline-gate: phase 1 ok");
  // Same passing event on a harness without a user channel (cline shape): no crash, plain allow.
  expect((await handleHook("cline", { preToolUse: { toolName: "x", parameters: {} }, taskId: "tE" }, { now: 5000, cwd })).stdout).toBe("");
});
