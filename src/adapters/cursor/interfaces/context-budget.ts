/**
 * Reservation key + registry location for one hook invocation's slice of
 * Cursor's shared, cross-process `additional_context` budget (see
 * `../context-budget.ts`). `undefined` at a call site means "no shared
 * budget available" — callers then fall back to the flat per-response cap.
 */
export interface CursorBudgetContext {
  /** Project state directory the registry file lives under (see `defaultStateDir`). */
  stateDir: string;
  /** Cursor `session_id` (its `conversation_id`). */
  sessionId: string;
  /** Raw Cursor `hook_event_name` (e.g. `"sessionStart"`). */
  event: string;
  /** Cursor `generation_id`; absent on `sessionStart`/`workspaceOpen`. */
  generationId?: string;
  /**
   * Cursor `tool_use_id`; present on preToolUse/postToolUse/postToolUseFailure
   * — Cursor merges `additional_context` PER TOOL CALL for these events, not
   * once per (session, event, generation), so this must join the key or
   * concurrent tool calls in the same generation would wrongly share one slice.
   */
  toolUseId?: string;
  /** Test seam: injectable clock (defaults to `Date.now()`). */
  now?: number;
}
