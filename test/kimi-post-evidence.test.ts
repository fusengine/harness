/**
 * Kimi Code delegation credit — integration level (handlePost).
 * Kimi's PostToolUse wire payload names the result field `tool_output` (a
 * plain, truncated string), never Claude's `tool_response` (an object) —
 * `handle-post.ts` already resolves `payload.tool_response ?? payload.tool_output`
 * additively; these tests exercise that resolution end to end through the
 * session track, plus a non-regression check for the untouched Claude path.
 */
import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { handlePost } from "../src/runtime/handle-post";
import { defaultStateDir, trackFile } from "../src/runtime/paths";
import { projectLayout } from "../src/config/layout";
import { loadTrack } from "../src/tracking/store";
import type { NormalizedEvent } from "../src/runtime/normalize";
import type { PreContext } from "../src/runtime/handle-pre";

const root = (): string => mkdtempSync(join(tmpdir(), "fh-kimi-post-"));

/** A `PreContext` for `handlePost`, given the harness `id` and the raw hook payload. */
function ctxFor(id: string, cwd: string, event: NormalizedEvent, payload: Record<string, unknown>): PreContext {
  const layout = projectLayout(cwd);
  const file = trackFile(event.sessionId, defaultStateDir(cwd));
  return { id, payload, event, framework: "generic", mcpDir: layout.cacheDir, file, opts: { now: 1000, cwd } };
}

test("handlePost (kimi): real Agent payload — tool_output (string, 800 chars) credits sufficient agent evidence", async () => {
  const cwd = root();
  const event: NormalizedEvent = { phase: "post", tool: "Agent", sessionId: "s-kimi-agent", input: { subagent_type: "explore-codebase", prompt: "map the repo" } };
  const payload = { hook_event_name: "PostToolUse", tool_name: "Agent", tool_call_id: "call-1", tool_output: "x".repeat(800) };
  await handlePost(ctxFor("kimi", cwd, event, payload));
  const t = await loadTrack(trackFile(event.sessionId, defaultStateDir(cwd)));
  expect(t.agents).toEqual([{ name: "explore-codebase", ts: 1000, quality: "sufficient" }]);
});

test("handlePost (kimi): tool_output too short, or absent (PostToolUseFailure), stays insufficient — threshold not weakened", async () => {
  const cwd = root();
  const shortEv: NormalizedEvent = { phase: "post", tool: "Agent", sessionId: "s-kimi-short", input: { subagent_type: "research-expert" } };
  await handlePost(ctxFor("kimi", cwd, shortEv, { hook_event_name: "PostToolUse", tool_name: "Agent", tool_output: "x".repeat(10) }));
  expect((await loadTrack(trackFile(shortEv.sessionId, defaultStateDir(cwd)))).agents).toEqual([{ name: "research-expert", ts: 1000, quality: "insufficient" }]);

  const absentEv: NormalizedEvent = { phase: "post", tool: "Agent", sessionId: "s-kimi-absent", input: { subagent_type: "research-expert" } };
  await handlePost(ctxFor("kimi", cwd, absentEv, { hook_event_name: "PostToolUseFailure", tool_name: "Agent" }));
  expect((await loadTrack(trackFile(absentEv.sessionId, defaultStateDir(cwd)))).agents).toEqual([{ name: "research-expert", ts: 1000, quality: "insufficient" }]);
});

test("handlePost (kimi): AgentSwarm credits like Agent/Task — subagent_type applies to every spawned sub-agent", async () => {
  const cwd = root();
  const event: NormalizedEvent = { phase: "post", tool: "AgentSwarm", sessionId: "s-kimi-swarm", input: { prompt_template: "review {{item}}", items: ["a.ts", "b.ts"], subagent_type: "coder" } };
  await handlePost(ctxFor("kimi", cwd, event, { hook_event_name: "PostToolUse", tool_name: "AgentSwarm", tool_output: "x".repeat(800) }));
  expect((await loadTrack(trackFile(event.sessionId, defaultStateDir(cwd)))).agents).toEqual([{ name: "coder", ts: 1000, quality: "sufficient" }]);
});

test("non-regression: Claude Code tool_response (OBJECT) still drives quality exactly as before — tool_output fallback is additive only", async () => {
  const cwd = root();
  const event: NormalizedEvent = { phase: "post", tool: "Task", sessionId: "s-claude", input: { subagent_type: "research-expert" } };
  await handlePost(ctxFor("claude-code", cwd, event, { tool_response: { output: "x".repeat(800) } }));
  expect((await loadTrack(trackFile(event.sessionId, defaultStateDir(cwd)))).agents).toEqual([{ name: "research-expert", ts: 1000, quality: "sufficient" }]);
});
