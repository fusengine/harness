/** A hook event normalized across harnesses. */
export interface NormalizedEvent {
  phase: "pre" | "post";
  tool: string;
  input: Record<string, unknown>;
  sessionId: string;
  filePath?: string;
  content?: string;
  command?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * Normalize a harness hook payload into a uniform event. Handles Cline's nested
 * `preToolUse`/`postToolUse` shape and the top-level `tool_name`/`tool_input`
 * shape used by Claude, Codex, Gemini, and Cursor.
 */
export function normalizeEvent(id: string, payload: Record<string, unknown>): NormalizedEvent {
  if (id === "cline") {
    const post = payload.postToolUse as Record<string, unknown> | undefined;
    const node = (post ?? (payload.preToolUse as Record<string, unknown> | undefined)) ?? {};
    const params = (node.parameters as Record<string, unknown> | undefined) ?? {};
    return {
      phase: post ? "post" : "pre",
      tool: str(node.toolName) ?? "",
      input: params,
      sessionId: str(payload.taskId) ?? "",
      filePath: str(params.path),
      content: str(params.content),
      command: str(params.command),
    };
  }
  const event = str(payload.hook_event_name) ?? "";
  const input = (payload.tool_input as Record<string, unknown> | undefined) ?? payload;
  return {
    phase: /post|after/i.test(event) ? "post" : "pre",
    tool: str(payload.tool_name) ?? "",
    input,
    sessionId: str(payload.session_id) ?? str(payload.conversation_id) ?? "",
    filePath: str(input.file_path) ?? str(input.path) ?? str(payload.file_path),
    content: str(input.content) ?? str(input.new_string),
    command: str(input.command) ?? str(payload.command),
  };
}
