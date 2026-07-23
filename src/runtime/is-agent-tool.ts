/**
 * Sub-agent dispatch tool detection — the single source of truth for "this
 * tool call spawns a sub-agent". Claude Code and Codex dispatch via `Task`;
 * Kimi Code CLI dispatches via `Agent` (and `AgentSwarm` for parallel fan-out).
 * Centralized so the APEX task-context injection, the activity tracking and
 * the PostToolUse evidence credit stop drifting on inline `"Task" | "Agent"`
 * unions: every consumer imports from HERE, never re-declares the list.
 */

/** Canonical set of sub-agent dispatch tool names (the ONLY definition). */
export const AGENT_TOOLS: ReadonlySet<string> = new Set(["Task", "Agent", "AgentSwarm"]);

/**
 * True when the tool is a sub-agent dispatch primitive on any harness.
 * @param tool - The normalized tool name from the hook payload.
 */
export function isAgentTool(tool: string): boolean {
  return AGENT_TOOLS.has(tool);
}
