/** `beforeShellExecution` stdin payload (subset). */
export interface CursorShellPayload {
  command?: string;
  cwd?: string;
  sandbox?: boolean;
  workspace_roots?: string[];
  hook_event_name?: string;
}

/** `preToolUse` stdin payload subset consumed by the adapter. */
export interface CursorToolPayload {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

/** `afterFileEdit` stdin payload (subset). */
export interface CursorEditPayload {
  file_path?: string;
  edits?: { old_string: string; new_string: string }[];
}

/** One extracted Cursor file edit used by runtime post fan-out. */
export interface CursorExtractedFile {
  filePath: string;
  oldString?: string;
  content: string;
  op: "update";
}

/** Shared Cursor extraction result consumed by runtime and public adapter. */
export interface CursorExtractedEvent {
  eventName: string;
  lifecycleEvent: string | null;
  responseKind: CursorResponseKind;
  blockable: boolean;
  cwd?: string;
  workspaceRoots?: string[];
  phase: "pre" | "post";
  tool: string;
  input: Record<string, unknown>;
  filePath?: string;
  content?: string;
  oldString?: string;
  command?: string;
  /** Distinct beforeMCPExecution root and nested commands, in wire order. */
  commandCandidates?: string[];
  files?: CursorExtractedFile[];
}

/** Native Cursor stdout contract selected for one hook event. */
export type CursorResponseKind =
  | "permission"
  | "post-context"
  | "session-context"
  | "submit-control"
  | "followup"
  | "compact-notice"
  | "plugin-paths"
  | "neutral";

/** Routing metadata for a documented Cursor lifecycle event. */
export interface CursorEventContract {
  phase: "pre" | "post";
  lifecycle: string | null;
  response: CursorResponseKind;
  blockable: boolean;
  known: boolean;
}

/**
 * Empty afterFileEdit callback. Cursor documents no output fields for this
 * post hook, so pre-execution permission fields are intentionally impossible.
 */
export type CursorEditResponse = Record<string, never>;

/**
 * `beforeShellExecution` stdout response. Message keys are snake_case:
 * Cursor silently ignores camelCase `userMessage`/`agentMessage` (#141516,
 * regression persists through v2.0.77+ — forum #142589), matching the
 * schema respond.ts emits for the cursor harness.
 */
export interface CursorResponse {
  permission: "allow" | "deny" | "ask";
  /** User-visible message — snake_case required (#141516, #142589). */
  user_message?: string;
  /** Agent-visible message — snake_case required (#141516, #142589). */
  agent_message?: string;
}
