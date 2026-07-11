/**
 * fuse-memory-neural scope dispatcher (async; the handlers hit Graphiti over
 * HTTP, best-effort). Routes by event: SessionStart recalls past lessons,
 * PostToolUse captures Bash errors / tracks graphiti+qdrant ops, SubagentStop
 * captures agent conclusions. Returns the native stdout when handled, or `null`
 * to fall through to the generic pipeline.
 */
import { captureAgentLesson } from "./agent-lesson";
import { captureBashError } from "./capture-error";
import { trackMemoryOp } from "./track-ops";
import { recallOnSession } from "./recall";

/** Is this a graphiti/qdrant MCP tool call? */
function isMemoryTool(tool: string): boolean {
  return tool.startsWith("mcp__graphiti") || tool.startsWith("mcp__qdrant");
}

/**
 * Dispatch a memory-scope lifecycle event to its ported handler.
 * @param event - Raw hook event name.
 * @param payload - Raw hook payload.
 * @param cwd - Project root.
 * @param now - Clock.
 * @returns The native stdout, or `null` when unhandled.
 */
export async function dispatchMemory(event: string, payload: Record<string, unknown>, cwd: string, now: number): Promise<string | null> {
  if (event === "SessionStart") return recallOnSession(cwd, now);
  if (event === "SubagentStop" || event === "Stop") {
    await captureAgentLesson(payload, now);
    return "";
  }
  if (event === "PostToolUse") {
    const tool = typeof payload.tool_name === "string" ? payload.tool_name : "";
    if (tool === "Bash") return captureBashError(payload, now);
    if (isMemoryTool(tool)) {
      trackMemoryOp(payload, now);
      return "";
    }
    return null;
  }
  return null;
}
