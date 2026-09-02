import { join } from "node:path";

/** One row of the exhaustive stdout-bytes table: event name + payload + exact expected stdout. */
export interface ByteCase {
  event: string;
  payload: (cwd: string) => Record<string, unknown>;
  stdout: string;
}

/**
 * All 21 documented Cursor hook events, each on its neutral/allow path, plus
 * one unknown event. Every payload avoids `.md` Read paths, `Shell`/`Bash`
 * tool names, and repeated dangerous commands — the 3 branches proven (by
 * direct CLI probing) to read or accumulate PERSISTENT state
 * (`~/.fuse-harness/state/**`, the one-shot gate repeat counters) that would
 * make a byte-exact `toBe()` flake across reruns or machines.
 */
export const CASES: ByteCase[] = [
  {
    event: "beforeShellExecution",
    payload: (cwd) => ({ hook_event_name: "beforeShellExecution", command: "ls -la", cwd, sandbox: false }),
    stdout: '{"permission":"allow"}',
  },
  {
    event: "beforeMCPExecution",
    payload: () => ({
      hook_event_name: "beforeMCPExecution", tool_name: "query-docs",
      tool_input: "{}", mcp_server_name: "context7",
    }),
    stdout: '{"permission":"allow"}',
  },
  {
    event: "afterShellExecution",
    payload: () => ({ hook_event_name: "afterShellExecution", command: "ls", output: "", duration: 1, sandbox: false }),
    stdout: "{}",
  },
  {
    event: "afterMCPExecution",
    payload: () => ({
      hook_event_name: "afterMCPExecution", tool_name: "query-docs",
      tool_input: "{}", result_json: "{}", duration: 1, mcp_server_name: "context7",
    }),
    stdout: "{}",
  },
  {
    event: "beforeReadFile",
    payload: (cwd) => ({ hook_event_name: "beforeReadFile", file_path: join(cwd, "notes.txt"), content: "hi", attachments: [] }),
    stdout: '{"permission":"allow"}',
  },
  {
    event: "afterFileEdit",
    payload: (cwd) => ({
      hook_event_name: "afterFileEdit", file_path: join(cwd, "notes.txt"),
      edits: [{ old_string: "a", new_string: "b" }],
    }),
    stdout: "{}",
  },
  {
    event: "beforeTabFileRead",
    payload: (cwd) => ({ hook_event_name: "beforeTabFileRead", file_path: join(cwd, "notes.ts"), content: "export {};" }),
    stdout: '{"permission":"allow"}',
  },
  {
    event: "afterTabFileEdit",
    payload: (cwd) => ({
      hook_event_name: "afterTabFileEdit", file_path: join(cwd, "notes.ts"),
      edits: [{ old_string: "a", new_string: "b" }],
    }),
    stdout: "{}",
  },
  { event: "stop", payload: () => ({ hook_event_name: "stop", status: "completed" }), stdout: "{}" },
  {
    // No `prompt` field: keeps this on the CLAUDE.md-injection-free branch
    // (userPrompt stays `undefined`), which is otherwise repo-content-dependent.
    event: "beforeSubmitPrompt",
    payload: () => ({ hook_event_name: "beforeSubmitPrompt", composer_mode: "agent" }),
    stdout: "{}",
  },
  { event: "afterAgentResponse", payload: () => ({ hook_event_name: "afterAgentResponse" }), stdout: "{}" },
  { event: "afterAgentThought", payload: () => ({ hook_event_name: "afterAgentThought" }), stdout: "{}" },
  { event: "sessionEnd", payload: () => ({ hook_event_name: "sessionEnd", reason: "user_closed_window" }), stdout: "{}" },
  { event: "preCompact", payload: () => ({ hook_event_name: "preCompact", trigger: "auto" }), stdout: "{}" },
  {
    event: "subagentStart",
    payload: () => ({ hook_event_name: "subagentStart", subagent_type: "explore-codebase", task: "map src/" }),
    stdout: '{"permission":"allow"}',
  },
  {
    event: "subagentStop",
    payload: () => ({ hook_event_name: "subagentStop", subagent_type: "explore-codebase", status: "completed" }),
    stdout: "{}",
  },
  {
    event: "preToolUse",
    payload: (cwd) => ({ hook_event_name: "preToolUse", tool_name: "Read", tool_input: { file_path: join(cwd, "notes.txt") } }),
    stdout: '{"permission":"allow"}',
  },
  {
    // `Write` -> canonicalized to `Edit` (adapters/cursor/normalize.ts), which
    // `activity.ts` never classifies (no doc/agent/explore/ref credit) — the
    // one Edit-like tool name guaranteed inert against persisted session state.
    event: "postToolUse",
    payload: (cwd) => ({
      hook_event_name: "postToolUse", tool_name: "Write",
      tool_input: { file_path: join(cwd, "notes.txt"), content: "hi" }, tool_output: "ok", cwd,
    }),
    stdout: "{}",
  },
  {
    event: "postToolUseFailure",
    payload: (cwd) => ({
      hook_event_name: "postToolUseFailure", tool_name: "Write",
      tool_input: { file_path: join(cwd, "notes.txt") }, error_message: "failed", failure_type: "tool_error",
    }),
    stdout: "{}",
  },
  {
    event: "workspaceOpen",
    payload: (cwd) => ({ hook_event_name: "workspaceOpen", cursor_version: "3.18.25", workspace_roots: [cwd] }),
    stdout: "{}",
  },
  {
    event: "futureCursorEvent (unknown)",
    payload: () => ({ hook_event_name: "futureCursorEvent", command: "rm -rf /" }),
    stdout: "{}",
  },
];
