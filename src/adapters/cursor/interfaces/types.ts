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

/** `beforeShellExecution` stdout response. */
export interface CursorResponse {
  permission: "allow" | "deny" | "ask";
  continue?: boolean;
  userMessage?: string;
  agentMessage?: string;
}
