/**
 * Codex multi_agent_v2 `spawn_agent` -> session evidence bridge. Codex's custom
 * agents (fusengine multi_agent_v2, e.g. sniper/explore-codebase) are launched
 * via a `spawn_agent` TOOL CALL inside the SAME session -- Codex has no
 * SubagentStart/SubagentStop lifecycle for them, so the existing Claude-side
 * evidence paths (agent-evidence-record.ts `classifyAgentEvidence`, the
 * SubagentStop harvest) never observe them; the harness only ever saw a
 * generic tool call. This module credits the SAME session track
 * ({@link recordAgent}, read back by `agent-evidence-record.ts`
 * `agentsFreshInTrack`) straight from that PostToolUse `spawn_agent` call.
 *
 * SOURCE (openai/codex@44918ea1, tag rust-v0.144.1 -- verified upstream,
 * not re-checked here): the hook `tool_name` is `"spawn_agent"` normally, or
 * the SEPARATOR-LESS namespace-prefixed `{namespace}spawn_agent` when the
 * `namespace_tools` capability provider is active (e.g.
 * `"fusengine_agentsspawn_agent"`, `"collaborationspawn_agent"`). Detection is
 * `tool_name === "spawn_agent" || tool_name.endsWith("spawn_agent")` -- a tool
 * that merely CONTAINS the substring without being an exact/suffix match
 * (`"spawn_agentX"`, `"myspawn_agent_tool"`) is correctly rejected.
 * `tool_input.agent_type` carries the spawned agent's type only when Codex's
 * `hide_spawn_agent_metadata=false`; treat it as always-optional.
 *
 * INVARIANT (multi-harness parity): every entry point here is gated on
 * `id === "codex"` FIRST -- claude-code/cursor/cline/gemini-cli/hermes always
 * take the early return, touching neither the track nor disk. Byte-identical
 * elsewhere by construction.
 */
import { recordAgent, type SessionTrack } from "../tracking/session-state";
import { loadTrack, saveTrack } from "../tracking/store";

/**
 * True when `tool` is Codex's `spawn_agent` primitive, bare or
 * namespace-prefixed (no separator). Rejects any tool that merely contains
 * the substring elsewhere in its name.
 * @param tool - Raw/normalized `tool_name` from the hook payload.
 */
export function isCodexSpawnAgentTool(tool: string): boolean {
  return tool === "spawn_agent" || tool.endsWith("spawn_agent");
}

/**
 * Extract the spawned agent's type from a `spawn_agent` `tool_input`, or
 * `undefined` when absent/blank (`hide_spawn_agent_metadata=true`, or a
 * future Codex build omitting it) -- never throws.
 * @param input - Raw `tool_input` payload (harness `event.input`).
 */
export function codexSpawnAgentType(input: Record<string, unknown> | undefined): string | undefined {
  const v = input?.agent_type;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/**
 * Pure classifier + folder: credit a Codex `spawn_agent` call into
 * `track.agents` under the SAME `subagent-<name>` convention the Claude-side
 * explore/research evidence uses -- so an `agent_type` that happens to match
 * a `REQUIRED_AGENTS` name (e.g. `"explore-codebase"`) is picked up by
 * `agentsFreshInTrack`'s substring match exactly like genuine Claude
 * Task/Agent evidence. Immutable: returns `track` UNCHANGED (same reference)
 * for any other harness `id`, any non-spawn tool, or a missing `agent_type`.
 * @param id - Harness id (only `"codex"` ever credits).
 * @param tool - Normalized event tool name (raw `tool_name`).
 * @param input - Raw `tool_input` payload.
 * @param track - The current session track.
 * @param ts - Epoch-ms timestamp of the tool call.
 * @returns The credited track, or `track` itself when nothing was credited.
 */
export function creditCodexSpawnAgent(id: string, tool: string, input: Record<string, unknown> | undefined, track: SessionTrack, ts: number): SessionTrack {
  if (id !== "codex" || !isCodexSpawnAgentTool(tool)) return track;
  const agentType = codexSpawnAgentType(input);
  if (!agentType) return track;
  return recordAgent(track, `subagent-${agentType}`, ts, "sufficient");
}

/**
 * I/O wiring for {@link creditCodexSpawnAgent}: load the session track, fold
 * in the credit, and persist only when something actually changed (skips a
 * write for the strict no-op cases). Mirrors `agent-evidence-record.ts`
 * `recordAgentEvidence`'s async load/save shape.
 * @param file - Session track file path (same one the freshness gate reads).
 * @param id - Harness id (only `"codex"` ever credits).
 * @param tool - Normalized event tool name (raw `tool_name`).
 * @param input - Raw `tool_input` payload.
 * @param ts - Epoch-ms timestamp of the tool call.
 */
export async function recordCodexSpawnEvidence(file: string, id: string, tool: string, input: Record<string, unknown> | undefined, ts: number): Promise<void> {
  if (id !== "codex" || !isCodexSpawnAgentTool(tool)) return;
  const track = await loadTrack(file);
  const next = creditCodexSpawnAgent(id, tool, input, track, ts);
  if (next !== track) await saveTrack(file, next);
}
