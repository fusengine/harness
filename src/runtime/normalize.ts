import { parseApplyPatch } from "../adapters/codex/apply-patch";
import { commandToString } from "./command-string";

/** One file fanned out of a multi-file edit primitive (Codex `apply_patch`). */
export interface NormalizedFile {
  filePath: string;
  content: string;
  op: "add" | "update" | "delete";
}

/** A hook event normalized across harnesses. */
export interface NormalizedEvent {
  phase: "pre" | "post";
  tool: string;
  input: Record<string, unknown>;
  sessionId: string;
  filePath?: string;
  content?: string;
  command?: string;
  /** Subagent type, if the tool-use came from one (Explore/Plan are file-size-exempt). */
  agentType?: string;
  /**
   * Per-file changes when the tool is a multi-file edit primitive (Codex
   * `apply_patch`). Present ONLY for `apply_patch`; the file gates OR each
   * entry's verdict so one violating hunk blocks the whole envelope. Left
   * undefined for every other tool/harness (single-file `filePath`/`content`).
   */
  files?: NormalizedFile[];
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
  const tool = str(payload.tool_name) ?? "";
  const base = {
    phase: (/post|after/i.test(event) ? "post" : "pre") as "pre" | "post",
    tool,
    input,
    sessionId: str(payload.session_id) ?? str(payload.conversation_id) ?? "",
    agentType: str(payload.agent_type) ?? str(input.subagent_type),
  };
  // Codex's `apply_patch` (its PRIMARY edit primitive) carries the whole change
  // set as a freeform patch in `command` — no `file_path`/`content`, so the
  // file-size/DRY/protected-path gates saw nothing (enforcement 0%). Fan it out
  // into `files` and DROP the patch text from `command` so it can't false-match
  // the git guards. Every other tool is untouched below.
  if (tool === "apply_patch") {
    const patch = str(input.command) ?? str(payload.command) ?? "";
    const files = parseApplyPatch(patch).map((f) => ({ filePath: f.path, content: f.content, op: f.op }));
    return { ...base, phase: "pre", files: files.length > 0 ? files : undefined };
  }
  return {
    ...base,
    filePath: str(input.file_path) ?? str(input.path) ?? str(payload.file_path),
    content: str(input.content) ?? str(input.new_string),
    command: commandToString(input.command) ?? commandToString(payload.command),
  };
}
