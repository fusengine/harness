/**
 * PostToolUse (mcp__graphiti|mcp__qdrant) memory handler. Ports
 * `track-memory-ops.py`: append `[ts] <tool> | ok|error` to
 * `operations.log`, rotating at 1000 lines (keeping the newest 500).
 */
import { isoUtc } from "../security/skill-state";
import { appendMemoryLog } from "./state";

/** Append a memory-operation log line for a graphiti/qdrant tool call. */
export function trackMemoryOp(payload: Record<string, unknown>, now: number): void {
  const tool = typeof payload.tool_name === "string" ? payload.tool_name : "unknown";
  const result = (payload.tool_result ?? payload.tool_response) as { error?: unknown } | undefined;
  const status = result?.error ? "error" : "ok";
  appendMemoryLog("operations.log", `[${isoUtc(now)}] ${tool} | ${status}`, 1000, 500);
}
