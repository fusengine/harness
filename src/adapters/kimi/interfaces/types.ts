/**
 * Kimi Code CLI shell-hook wire types. Verified 2026 against
 * kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html (v0.27.0):
 * hooks are configured in `~/.kimi-code/config.toml` under `[[hooks]]`,
 * receive a snake_case JSON payload on stdin, and answer with a camelCase
 * JSON envelope on stdout (a real, documented casing inconsistency).
 */

/**
 * `PreToolUse`/`UserPromptSubmit`/`Stop` stdin payload (subset). Same base
 * wire shape as Claude Code (`hook_event_name`/`tool_name`/`tool_input`/
 * `cwd`); `tool_input.command` is confirmed for `Bash` by the docs' example
 * script (`payload.tool_input?.command`). Verified live against kimi-code
 * v0.27.0 on `PreToolUse`/`Bash`: `tool_name` is present at top level (the
 * docs never name it as a stdin key) and `tool_input.command` carries the
 * shell string. The live payload also carries an UNDOCUMENTED `tool_call_id`
 * (e.g. `"tool_LsTnl0gBxM62XuWvKw0GFGHs"`); the harness does not consume it,
 * so it is deliberately absent from this interface. `cwd` is the
 * symlink-resolved path (macOS: `/private/tmp/…` for a shell in `/tmp/…`).
 */
export interface KimiHookInput {
  hook_event_name?: string;
  tool_name?: string;
  /**
   * Verified against the official tool reference (`docs/en/reference/tools.md`,
   * moonshotai/kimi-code) AND live against kimi-code v0.27.0: `Write` sends
   * `{ path, content, mode? }`, `Edit` sends
   * `{ path, old_string, new_string, replace_all? }` — the path key is `path`,
   * NOT Claude's `file_path`. `file_path` is kept as a tolerated alias (read
   * second) for Claude-shaped replay payloads, mirroring
   * `runtime/normalize.ts` which resolves both on the CLI path.
   */
  tool_input?: {
    path?: string;
    file_path?: string;
    content?: string;
    new_string?: string;
    command?: string | string[];
  };
  session_id?: string;
  cwd?: string;
}

/**
 * Hook stdout response. Only `"deny"` is documented for `permissionDecision`
 * — no `"ask"`/`"allow"` value, and no `additionalContext` field exists on
 * this envelope. Blocking events are `UserPromptSubmit`, `PreToolUse`, and
 * `Stop` only; every other event's return value is ignored.
 */
export interface KimiResponse {
  hookSpecificOutput?: {
    permissionDecision?: "deny";
    permissionDecisionReason?: string;
  };
}
