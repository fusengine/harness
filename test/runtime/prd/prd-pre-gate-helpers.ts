/** Shared helpers for the prd-pre-gate test files (split for the SOLID line cap). */
import { normalizeEvent } from "../../../src/runtime/normalize";
import type { NormalizedEvent } from "../../../src/runtime/normalize";

/** Extracts `permissionDecisionReason` from a rendered claude-code/codex deny stdout. */
export function denyReason(stdout: string): string {
  return (JSON.parse(stdout) as { hookSpecificOutput?: { permissionDecisionReason?: string } }).hookSpecificOutput?.permissionDecisionReason ?? "";
}

/** Builds a claude-code Write event targeting `absPath`, with optional identity fields. */
export function writeEvent(sessionId: string, absPath: string, agentId?: string, agentType?: string): NormalizedEvent {
  return normalizeEvent("claude-code", {
    hook_event_name: "PreToolUse", tool_name: "Write", session_id: sessionId,
    tool_input: { file_path: absPath, content: "{}" },
    ...(agentId ? { agent_id: agentId } : {}), ...(agentType ? { agent_type: agentType } : {}),
  });
}

/** Builds a Bash PreToolUse event on `harness`, with optional identity fields. */
export function bashEvent(harness: string, sessionId: string, command: string, agentId?: string, agentType?: string): NormalizedEvent {
  return normalizeEvent(harness, {
    hook_event_name: "PreToolUse", tool_name: "Bash", session_id: sessionId, tool_input: { command },
    ...(agentId ? { agent_id: agentId } : {}), ...(agentType ? { agent_type: agentType } : {}),
  });
}

/** True when a rendered stdout is a hard `"deny"` permission decision. */
export function isDenied(stdout: string): boolean {
  return stdout.includes("\"deny\"");
}
