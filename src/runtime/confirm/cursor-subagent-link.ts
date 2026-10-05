import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { loadSessionState, saveSessionState, sanitizeSessionId } from "../home-state";

/**
 * Cursor runs every sub-agent under its OWN `conversation_id`, while the human
 * types `CONFIRM <code>` in the PARENT chat — so a token is armed on the parent
 * session and the sub-agent's denied command could never reach it (endless
 * CONFIRM loop). Cursor's `subagentStart` (dispatched in the parent) carries
 * `tool_call_id` (documented: "ID of the tool call that triggered the subagent")
 * and `parent_conversation_id`; every hook payload of the sub-agent itself carries
 * that same id as `parent_tool_call_id` (observed in Cursor 3.23 hook logs, not
 * documented). Absent field anywhere → no link → behavior exactly as before.
 */

/** Session-state key prefix: one tiny state file per Cursor sub-agent (atomic, idempotent under fan-out). */
const LINK_PREFIX = "cursor-subagent-";

/** State key for a sub-agent's triggering tool-call id (hashed: any id format, no path risk), or null when absent. */
function linkKey(toolCallId: unknown): string | null {
  if (typeof toolCallId !== "string" || !toolCallId.trim()) return null;
  return `${LINK_PREFIX}${createHash("sha256").update(toolCallId.trim()).digest("hex").slice(0, 32)}`;
}

/**
 * Record, at Cursor `subagentStart`, which parent session triggered the sub-agent.
 * Never throws (lifecycle hook).
 * @param payload - Raw Cursor `subagentStart` payload.
 * @param home - Test-only OS home override.
 */
export function recordCursorSubagentLink(payload: Record<string, unknown>, home: string = homedir()): void {
  try {
    const key = linkKey(payload.tool_call_id ?? payload.subagent_id);
    const parent = sanitizeSessionId(payload.parent_conversation_id ?? payload.session_id ?? payload.conversation_id);
    if (key && parent) saveSessionState(key, { parentSessionId: parent }, home);
  } catch {
    // A state-io failure only loses the link: the CONFIRM flow falls back to the former per-session behavior.
  }
}

/**
 * The parent session of a Cursor sub-agent's hook payload, or `undefined` for a
 * top-level payload, an unknown link, or a link pointing back to the same session.
 * @param payload - Raw Cursor tool-hook payload (preToolUse / beforeShellExecution).
 * @param home - Test-only OS home override.
 * @returns The parent session id, when known.
 */
export function cursorParentSessionId(payload: Record<string, unknown>, home: string = homedir()): string | undefined {
  try {
    const key = linkKey(payload.parent_tool_call_id);
    if (!key) return undefined;
    const parent = sanitizeSessionId(loadSessionState(key, home).parentSessionId);
    const own = sanitizeSessionId(payload.session_id ?? payload.conversation_id);
    return parent && parent !== own ? parent : undefined;
  } catch {
    return undefined;
  }
}
