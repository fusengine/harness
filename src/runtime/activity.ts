import type { Activity } from "./record";
import type { AgentQuality } from "../tracking/session-state";
import { classifyExplore } from "../freshness/explore-tools";

/** A live tool-use, already normalized to `tool` + `input` by the adapter. */
export interface ToolEvent {
  /** The harness's `tool_name` (Cline: `preToolUse.toolName`), as a plain string. */
  tool: string;
  input?: Record<string, unknown>;
  sessionId: string;
  framework: string;
  now: number;
  /** Length of the tool response (POST events) — drives agent `quality`. */
  responseLength?: number;
}

/** Min response length (chars) for a lead agent call to count as `sufficient`. */
const AGENT_QUALITY_MIN = 500;

/** Min response length (chars) for direct exploration/research (parity Python `> 50`). */
const EXPLORE_QUALITY_MIN = 50;

/** Read tools across harnesses (Claude `Read`, Gemini/Cline `read_file`, …). */
const READ_TOOLS = new Set(["Read", "read_file", "read_many_files"]);

/** Grade a response length against a threshold; `undefined` when length is unknown. */
function qualityFor(len: number | undefined, min: number): AgentQuality | undefined {
  return len === undefined ? undefined : len > min ? "sufficient" : "insufficient";
}

/** Build an `agent` activity, attaching `quality` only when graded. */
function agentActivity(name: string, ts: number, quality: AgentQuality | undefined): Activity {
  return quality ? { kind: "agent", name, ts, quality } : { kind: "agent", name, ts };
}

/**
 * Map a live tool-use to the activity to record, or null when nothing is
 * tracked. Works across harnesses — tool names are globally distinct:
 * - MCP doc calls (`context7` / `exa`, any separator) → `doc`
 * - `Task`/`Agent` + `subagent_type` (Claude/Cursor) → `agent` (bare agent name)
 * - direct exploration/research (Glob/Grep, explore Bash, web, MCP cache reads)
 *   → `agent` credited to the matching REQUIRED_AGENTS phase
 * - a read tool opening a `.md` reference → `ref`
 */
export function activityFor(event: ToolEvent): Activity | null {
  if (/context7|exa/i.test(event.tool)) {
    return { kind: "doc", framework: event.framework, sessionId: event.sessionId, source: /exa/i.test(event.tool) ? "exa" : "context7" };
  }
  if (event.tool === "Task" || event.tool === "Agent") {
    const name = String(event.input?.subagent_type ?? event.input?.name ?? "").split(":").pop() ?? "";
    if (!name) return null;
    return agentActivity(name, event.now, qualityFor(event.responseLength, AGENT_QUALITY_MIN));
  }
  const hit = classifyExplore(event.tool, event.input);
  if (hit) {
    const quality = hit.cacheHit ? "sufficient" : qualityFor(event.responseLength, EXPLORE_QUALITY_MIN);
    return agentActivity(hit.phase, event.now, quality);
  }
  if (READ_TOOLS.has(event.tool)) {
    const path = String(event.input?.file_path ?? event.input?.path ?? "");
    if (path.endsWith(".md")) return { kind: "ref", path };
  }
  return null;
}
