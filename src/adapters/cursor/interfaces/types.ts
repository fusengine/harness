/** `beforeShellExecution` stdin payload (subset). */
export interface CursorShellPayload {
  command?: string;
  cwd?: string;
  workspace_roots?: string[];
  hook_event_name?: string;
}

/** `afterFileEdit` stdin payload (subset). */
export interface CursorEditPayload {
  file_path?: string;
  edits?: { old_string: string; new_string: string }[];
}

/**
 * `afterFileEdit` stdout response. Its schema (cursor.com/docs/hooks#afterFileEdit)
 * is DELIBERATELY narrower than the "before" hooks: `permission` + `user_message`
 * only — there is NO `agent_message` and NO `updated_input`. Since the edit is
 * already on disk when this "after" hook fires, `deny` cannot revert it and the
 * correction reaches only the HUMAN (`user_message`), never the model — so this
 * path is strictly ADVISORY, not an enforceable gate.
 */
export interface CursorEditResponse {
  permission: "allow" | "deny";
  /** User-visible correction — snake_case (#141516); the only channel afterFileEdit exposes. */
  user_message?: string;
}

/**
 * `beforeShellExecution` stdout response. Message keys are snake_case:
 * Cursor silently ignores camelCase `userMessage`/`agentMessage` (#141516,
 * regression persists through v2.0.77+ — forum #142589), matching the
 * schema respond.ts emits for the cursor harness.
 */
export interface CursorResponse {
  permission: "allow" | "deny" | "ask";
  continue?: boolean;
  /** User-visible message — snake_case required (#141516, #142589). */
  user_message?: string;
  /** Agent-visible message — snake_case required (#141516, #142589). */
  agent_message?: string;
}
