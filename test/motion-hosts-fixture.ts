import { handleHook } from "../src/runtime/handle";
import { makeFixture, type MotionFixture } from "./motion-handle-fixture";

export { makeFixture, type MotionFixture };

/** Every host `respond()` supports for the motion scope. */
export const HOSTS = ["claude-code", "codex", "kimi", "cursor", "gemini-cli", "cline", "hermes"] as const;
export type Host = (typeof HOSTS)[number];

type P = Record<string, unknown>;

/** Native shell-call payload of a host. */
export function shell(h: Host, sid: string, command: string, cwd: string): P {
  switch (h) {
    case "claude-code":
    case "kimi":
      return { hook_event_name: "PreToolUse", session_id: sid, tool_use_id: `t-${sid}`, tool_name: "Bash", tool_input: { command }, cwd };
    case "codex":
      return { hook_event_name: "PreToolUse", session_id: sid, turn_id: "1", tool_use_id: `t-${sid}`, tool_name: "Bash", tool_input: { command }, cwd };
    case "cursor":
      return { hook_event_name: "beforeShellExecution", conversation_id: sid, generation_id: "g1", command, cwd, workspace_roots: [cwd] };
    case "gemini-cli":
      return { hook_event_name: "BeforeTool", session_id: sid, tool_name: "run_shell_command", tool_input: { command }, cwd };
    case "cline":
      return { hookName: "PreToolUse", taskId: sid, preToolUse: { toolName: "execute_command", parameters: { command } } };
    case "hermes":
      return { hook_event_name: "pre_tool_call", session_id: sid, tool_name: "terminal", tool_input: { command }, cwd };
  }
}

/** Native post-shell-call payload of a host (same `sid`/tool-use id as {@link shell}). */
export function postShell(h: Host, sid: string, command: string, cwd: string): P {
  switch (h) {
    case "claude-code":
    case "kimi":
    case "codex":
      return { ...shell(h, sid, command, cwd), hook_event_name: "PostToolUse" };
    case "cursor":
      return { ...shell(h, sid, command, cwd), hook_event_name: "afterShellExecution" };
    case "gemini-cli":
      return { ...shell(h, sid, command, cwd), hook_event_name: "AfterTool" };
    case "cline":
      return { hookName: "PostToolUse", taskId: sid, postToolUse: { toolName: "execute_command", parameters: { command } } };
    case "hermes":
      return { ...shell(h, sid, command, cwd), hook_event_name: "post_tool_call" };
  }
}

/** Native file-write payload of a host. */
export function write(h: Host, sid: string, path: string, content: string, cwd: string): P {
  switch (h) {
    case "claude-code":
      return { hook_event_name: "PreToolUse", session_id: sid, tool_name: "Write", tool_input: { file_path: path, content }, cwd };
    case "kimi":
      return { hook_event_name: "PreToolUse", session_id: sid, tool_name: "Write", tool_input: { path, content }, cwd };
    case "codex":
      return { hook_event_name: "PreToolUse", session_id: sid, turn_id: "1", tool_use_id: `p-${sid}`, tool_name: "apply_patch", tool_input: { command: `*** Begin Patch\n*** Add File: ${path}\n+${content}\n*** End Patch` }, cwd };
    case "cursor":
      return { hook_event_name: "preToolUse", conversation_id: sid, generation_id: "g1", tool_name: "Write", tool_input: { file_path: path, content }, cwd, workspace_roots: [cwd] };
    case "gemini-cli":
      return { hook_event_name: "BeforeTool", session_id: sid, tool_name: "write_file", tool_input: { file_path: path, content }, cwd };
    case "cline":
      return { hookName: "PreToolUse", taskId: sid, preToolUse: { toolName: "write_to_file", parameters: { path, content } } };
    case "hermes":
      return { hook_event_name: "pre_tool_call", session_id: sid, tool_name: "write_file", tool_input: { path, content }, cwd };
  }
}

/** Native user-prompt payload of a host. */
export function userPrompt(h: Host, sid: string, text: string, cwd: string): P {
  switch (h) {
    case "claude-code":
    case "codex":
      return { hook_event_name: "UserPromptSubmit", session_id: sid, prompt: text, cwd };
    case "kimi":
      return { hook_event_name: "UserPromptSubmit", session_id: sid, prompt: [{ type: "text", text }], cwd };
    case "cursor":
      return { hook_event_name: "beforeSubmitPrompt", conversation_id: sid, generation_id: "g1", prompt: text, workspace_roots: [cwd] };
    case "gemini-cli":
      return { hook_event_name: "BeforeAgent", session_id: sid, prompt: text, cwd };
    case "cline":
      return { hookName: "UserPromptSubmit", taskId: sid, userPromptSubmit: { prompt: text } };
    case "hermes":
      return { hook_event_name: "pre_llm_call", session_id: sid, cwd, extra: { user_message: text } };
  }
}

/** Run one hook through `handleHook` under the motion scope; returns stdout. */
export async function runHost(fx: MotionFixture, h: Host, payload: P): Promise<string> {
  return (await handleHook(h, payload, { now: 1_000_000, cwd: fx.proj, home: fx.home, scope: "motion" })).stdout;
}

/** True for "nothing to say" (Cursor's common exit wraps an empty stdout into `{}`). */
export function silent(out: string): boolean {
  return out === "" || out === "{}";
}

/** True when `out` is the host's NATIVE refusal. */
export function denied(h: Host, out: string): boolean {
  switch (h) {
    case "claude-code":
    case "codex":
    case "kimi":
      return out.includes('"permissionDecision":"deny"');
    case "cursor":
      return out.includes('"permission":"deny"');
    case "gemini-cli":
      return out.includes('"decision":"deny"');
    case "cline":
      return out.includes('"cancel":true');
    case "hermes":
      return out.includes('"decision":"block"');
  }
}
