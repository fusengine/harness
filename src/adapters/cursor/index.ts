/** Cursor hook adapter; post-edit handling remains observe-only. */
import { evaluate } from "../../policy/evaluate";
import { formatPrompt } from "../../prompt/types";
import { extractCursorEvent } from "./normalize";
import type { CursorShellPayload, CursorToolPayload, CursorEditPayload, CursorResponse, CursorEditResponse } from "./interfaces/types";

export type { CursorShellPayload, CursorToolPayload, CursorEditPayload, CursorResponse, CursorEditResponse } from "./interfaces/types";

function guardCursor(payload: object): CursorResponse {
  const event = extractCursorEvent(payload);
  const result = evaluate({ tool: event.tool, filePath: event.filePath, content: event.content, oldString: event.oldString, command: event.command });
  if (result.decision === "allow" || !result.prompt) return { permission: "allow" };
  const message = formatPrompt(result.prompt);
  const userMessage = result.prompt.kind === "ask"
    ? `[downgraded from ask — Cursor preToolUse does not reliably enforce ask]\n${message}`
    : message;
  return { permission: "deny", user_message: userMessage, agent_message: message };
}

function namedPayload(payload: object, eventName: string): object {
  return Object.hasOwn(payload, "hook_event_name") ? payload : { ...payload, hook_event_name: eventName };
}

/** Guard a shell command (git/install policies). */
export function beforeShellExecution(payload: CursorShellPayload): CursorResponse {
  return guardCursor(namedPayload(payload, "beforeShellExecution"));
}

/** Guard a generic Cursor tool call using the same extraction as the runtime. */
export function preToolUse(payload: CursorToolPayload): CursorResponse {
  return guardCursor(namedPayload(payload, "preToolUse"));
}

/**
 * Complete an observed file edit without emitting pre-execution permission
 * fields. Cursor does not define a callback schema for this post hook.
 * @param payload - The `afterFileEdit` stdin payload.
 * @returns An empty successful response.
 */
export function afterFileEdit(payload: CursorEditPayload): CursorEditResponse {
  void payload;
  return {};
}
