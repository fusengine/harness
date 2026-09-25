import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { handleHook } from "../src/runtime/handle";

type Id = "claude-code" | "codex" | "cursor" | "kimi";
const ADAPTERS: readonly Id[] = ["claude-code", "codex", "cursor", "kimi"];
const BASE_SKILL = "/m/plugins/shadcn-expert/skills/shadcn-detection/SKILL.md";
const DESIGN_SKILL = "/m/plugins/design-expert/skills/design-system/SKILL.md";
const NO_RESEARCH = "No MCP research done for shadcn";

/** Fresh project root per case: track state + the refs journal are keyed by cwd. */
const root = (sub = ""): string => {
  const dir = join(mkdtempSync(join(tmpdir(), "fh-rm-")), sub);
  mkdirSync(dir, { recursive: true });
  return dir;
};
/** Native tool name per adapter: Cursor reports MCP tools as `MCP:<tool>`, Kimi's subagent tool is `Agent`. */
const nativeTool = (id: Id, tool: string): string => {
  if (id === "cursor" && tool.startsWith("mcp__")) return `MCP:${tool.split("__")[2]}`;
  return id === "kimi" && tool === "Task" ? "Agent" : tool;
};
/** Native PreToolUse Write per adapter: Cursor camelCase event + conversation_id, Kimi `path` (not `file_path`). */
const write = (id: Id, sid: string, file_path: string, content: string): Record<string, unknown> => {
  if (id === "cursor") return { hook_event_name: "preToolUse", conversation_id: sid, session_id: sid, tool_name: "Write", tool_input: { file_path, content } };
  if (id === "kimi") return { hook_event_name: "PreToolUse", session_id: sid, tool_name: "Write", tool_input: { path: file_path, content } };
  return { hook_event_name: "PreToolUse", session_id: sid, tool_name: "Write", tool_input: { file_path, content } };
};
/** Native PostToolUse per adapter, used only to record session evidence (skill reads, docs, agents). */
const post = (id: Id, sid: string, tool: string, input?: Record<string, unknown>): Record<string, unknown> => {
  const out = "x".repeat(600);
  const tool_name = nativeTool(id, tool);
  if (id === "cursor") return { hook_event_name: "postToolUse", conversation_id: sid, session_id: sid, tool_name, tool_input: input, tool_output: out };
  if (id === "kimi") {
    const tool_input = input?.file_path ? { path: input.file_path } : input;
    return { hook_event_name: "PostToolUse", session_id: sid, tool_name, tool_input, tool_output: out };
  }
  return { hook_event_name: "PostToolUse", session_id: sid, tool_name, tool_input: input, tool_response: out };
};
/**
 * Non-allow reason from either envelope (Claude/Codex/Kimi `hookSpecificOutput`, Cursor `permission`), else undefined.
 * `ask` counts as non-allow (Claude Code emits it natively), so it can never pass a `toBeUndefined()` allow check.
 * Non-JSON stdout is never a deny: Kimi's allow-with-notice (`inform`) is raw text at exit 0.
 */
const reason = (stdout: string): string | undefined => {
  if (!stdout.trim().startsWith("{")) return undefined;
  const o = JSON.parse(stdout) as {
    permission?: string; user_message?: string;
    hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string };
  };
  if (o.permission === "deny" || o.permission === "ask") return o.user_message ?? "";
  const d = o.hookSpecificOutput?.permissionDecision;
  return d === "deny" || d === "ask" ? o.hookSpecificOutput?.permissionDecisionReason ?? "" : undefined;
};
/** Run one hook payload through the real pipeline; returns the non-allow reason, or undefined when allowed. */
const run = async (id: Id, cwd: string, payload: Record<string, unknown>, now: number): Promise<string | undefined> =>
  reason((await handleHook(id, payload, { now, cwd })).stdout);
/** Record session evidence (skill read, doc call, agent spawn) via a native PostToolUse payload. */
const record = (id: Id, cwd: string, sid: string, tool: string, input: Record<string, unknown> | undefined, now: number) =>
  handleHook(id, post(id, sid, tool, input), { now, cwd });
/** Record a read of the shadcn-detection SKILL.md (satisfies the shadcn skill gate). */
const readBaseSkill = (id: Id, cwd: string, sid: string) => record(id, cwd, sid, "Read", { file_path: BASE_SKILL }, 1000);

for (const id of ADAPTERS) {
  test(`${id}: version bump in plugins/shadcn-expert/.claude-plugin/plugin.json allowed without research`, async () => {
    const cwd = root();
    const file = join(cwd, "plugins/shadcn-expert/.claude-plugin/plugin.json");
    const bump = '{\n  "name": "shadcn-expert",\n  "version": "1.0.18"\n}\n';
    expect(await run(id, cwd, write(id, "s1", file, bump), 2000)).toBeUndefined();
    await readBaseSkill(id, cwd, "s1");
    expect(await run(id, cwd, write(id, "s1", file, bump), 2000)).toBeUndefined();
  });

  test(`${id}: witness — sibling .claude-plugin/hooks.json and a ui .css keep "${NO_RESEARCH}"`, async () => {
    const cwd = root();
    await readBaseSkill(id, cwd, "s5");
    expect(await run(id, cwd, write(id, "s5", join(cwd, "plugins/shadcn-expert/.claude-plugin/hooks.json"), "{}\n"), 2000)).toContain(NO_RESEARCH);
    expect(await run(id, cwd, write(id, "s5", join(cwd, "plugins/shadcn-expert/components/ui/x.css"), "a{}\n"), 2000)).toContain(NO_RESEARCH);
  });

  test(`${id}: marketplace.json and CHANGELOG.md allowed without research`, async () => {
    const cwd = root("fuse-ui");
    expect(await run(id, cwd, write(id, "s2", join(cwd, ".claude-plugin/marketplace.json"), '{"version":"1.0.18"}\n'), 2000)).toBeUndefined();
    expect(await run(id, cwd, write(id, "s2", join(cwd, "plugins/shadcn-expert/CHANGELOG.md"), "## 1.0.18\n"), 2000)).toBeUndefined();
  });

  test(`${id}: FuseCore forced skill skips CHANGELOG.md/plugin.json, still blocks README.md`, async () => {
    const cwd = root();
    mkdirSync(join(cwd, "FuseCore"));
    mkdirSync(join(cwd, "artisan"));
    expect(await run(id, cwd, write(id, "s3", join(cwd, "CHANGELOG.md"), "## 1.0.18\n"), 2000)).toBeUndefined();
    expect(await run(id, cwd, write(id, "s3", join(cwd, ".claude-plugin/plugin.json"), "{}\n"), 2000)).toBeUndefined();
    expect(await run(id, cwd, write(id, "s3", join(cwd, "README.md"), "# x\n"), 2000)).toContain("FuseCore skill not consulted");
  });

  test(`${id}: .tsx under plugins/shadcn-expert keeps its deny, allowed once research is done`, async () => {
    const cwd = root();
    const tsx = write(id, "s4", join(cwd, "plugins/shadcn-expert/components/ui/button.tsx"), "export const a = 1;\n");
    expect(await run(id, cwd, tsx, 2000)).toContain("design skill not consulted");
    await record(id, cwd, "s4", "Read", { file_path: DESIGN_SKILL }, 1000);
    expect(await run(id, cwd, tsx, 2000)).toContain("no documentation consulted");
    await record(id, cwd, "s4", "mcp__context7__query-docs", undefined, 1100);
    await record(id, cwd, "s4", "mcp__exa__web_search_exa", undefined, 1200);
    await record(id, cwd, "s4", "Task", { subagent_type: "x:explore-codebase" }, 1300);
    await record(id, cwd, "s4", "Task", { subagent_type: "x:research-expert" }, 1400);
    expect(await run(id, cwd, tsx, 2000)).toContain("shadcn skill not consulted");
    await readBaseSkill(id, cwd, "s4");
    expect(await run(id, cwd, tsx, 2000)).toBeUndefined();
  });
}
