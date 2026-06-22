import type { Activity } from "./record";

/** A live tool-use, already normalized to `tool` + `input` by the adapter. */
export interface ToolEvent {
  /** The harness's `tool_name` (Cline: `preToolUse.toolName`), as a plain string. */
  tool: string;
  input?: Record<string, unknown>;
  sessionId: string;
  framework: string;
  now: number;
}

/** Read tools across harnesses (Claude `Read`, Gemini/Cline `read_file`, …). */
const READ_TOOLS = new Set(["Read", "read_file", "read_many_files"]);

/**
 * Map a live tool-use to the activity to record, or null when nothing is
 * tracked. Works across harnesses — tool names are globally distinct:
 * - MCP doc calls (`context7` / `exa`, any separator) → `doc`
 * - `Task` + `subagent_type` (Claude/Cursor) → `agent` (bare agent name)
 * - a read tool opening a `.md` reference → `ref`
 */
export function activityFor(event: ToolEvent): Activity | null {
  if (/context7|exa/i.test(event.tool)) {
    return { kind: "doc", framework: event.framework, sessionId: event.sessionId, source: /exa/i.test(event.tool) ? "exa" : "context7" };
  }
  if (event.tool === "Task") {
    const name = String(event.input?.subagent_type ?? "").split(":").pop() ?? "";
    return name ? { kind: "agent", name, ts: event.now } : null;
  }
  if (READ_TOOLS.has(event.tool)) {
    const path = String(event.input?.file_path ?? event.input?.path ?? "");
    if (path.endsWith(".md")) return { kind: "ref", path };
  }
  return null;
}
