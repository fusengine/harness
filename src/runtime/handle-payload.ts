import type { NormalizedEvent } from "./normalize";
import { isRecordObject } from "../util/record-object";

/** Raw Claude hook event name from a payload (empty when absent). */
export function rawEventName(payload: Record<string, unknown>): string {
  return typeof payload.hook_event_name === "string" ? payload.hook_event_name : "";
}

/**
 * `payload.tool_input` parsed into an object when it's a JSON STRING —
 * Cursor's real wire format for `beforeMCPExecution`/`afterMCPExecution`
 * (ground truth), unlike every other harness (and Cursor's own
 * `preToolUse`/`postToolUse`), which always sends it as an object already.
 * `undefined` when `tool_input` is already an object, absent, or fails to
 * parse into one (fail-open — the caller then keeps the original value).
 * @param payload - The raw hook payload.
 */
function cursorParsedToolInput(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  const raw = payload.tool_input;
  if (typeof raw !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecordObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `id === "cursor"` only: project the already-resolved canonical `tool_name`
 * (`event.tool`, normalized by `normalizeEvent`) and `cwd` (the project
 * root resolved via `cursorProjectCwd`, already applied to `opts.cwd`) onto a
 * shallow payload copy — the single passage point for every downstream
 * consumer that reads `payload.tool_name`/`payload.cwd`/`payload.tool_input`
 * RAW instead of `event.tool`/`opts.cwd`/`event.input` (lifecycle-bridge's
 * `failure-lesson.ts`/`agent-memory.ts`, handle-scope-async's aipilot/memory
 * dispatchers — including `doc-cache-gate.ts`'s `libraryOf`, which never
 * `JSON.parse`s a string `tool_input` itself — and the seo scope's
 * `post-tool-use.ts`). `tool_input` is additionally replaced by its parsed
 * object form via {@link cursorParsedToolInput} when Cursor sent it as a
 * JSON string (`beforeMCPExecution`/`afterMCPExecution`). Cursor's own wire
 * values ("Shell", `MCP:<tool>`, a bare `workspace_roots` array with no
 * `cwd` field, a stringified `tool_input`, …) are preserved under
 * `cursor_tool_name`/`cursor_cwd`/`cursor_tool_input` so nothing is lost.
 * Every other harness id is untouched (returns the SAME object,
 * byte-identical).
 * @param payload - The raw hook payload.
 * @param event - The already-normalized event (`event.tool` is canonical).
 * @param cwd - The resolved project root for this invocation.
 * @param id - Harness adapter id.
 */
export function cursorRawPayloadProjection(payload: Record<string, unknown>, event: NormalizedEvent, cwd: string, id: string): Record<string, unknown> {
  if (id !== "cursor") return payload;
  const parsedToolInput = cursorParsedToolInput(payload);
  return {
    ...payload,
    cursor_tool_name: payload.tool_name,
    cursor_cwd: payload.cwd,
    tool_name: event.tool,
    cwd,
    ...(parsedToolInput ? { cursor_tool_input: payload.tool_input, tool_input: parsedToolInput } : {}),
  };
}
