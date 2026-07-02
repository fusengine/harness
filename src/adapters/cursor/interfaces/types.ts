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
