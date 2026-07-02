/**
 * Hermes Agent (NousResearch/hermes-agent) shell-hook wire types. Verified 2026
 * against hermes-agent.nousresearch.com/docs/user-guide/features/hooks: hooks
 * are configured in `~/.hermes/config.yaml` under `hooks:`, receive a JSON
 * payload on stdin, and answer with JSON on stdout.
 */

/** `pre_tool_call` stdin payload (subset). Same wire shape as Claude Code. */
export interface HermesHookInput {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { path?: string; file_path?: string; content?: string; command?: string };
  session_id?: string;
  cwd?: string;
}

/**
 * Hook stdout response. `{}` allows; `{ decision: "block", reason }` cancels
 * the tool call; `{ context }` injects LLM context (honored on `pre_llm_call`).
 * Hermes has NO Claude-style `permissionDecision` and no interactive "ask".
 */
export interface HermesResponse {
  decision?: "block";
  reason?: string;
  context?: string;
}
