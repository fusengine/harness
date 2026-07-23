/**
 * Session-track agent evidence — writer (parity track-subagent-research.py) +
 * reader scan (parity apex_agent_helpers._scan_agents). Sub-agent hooks fire
 * with the LEAD's `session_id`, so evidence recorded here lands in the ONE
 * session track the freshness gate scans FIRST — sidechain research and
 * Workflow-spawned agents count, unlike the lead-transcript scan.
 */
import { classifyExplore } from "./explore-tools";
import { withTrack } from "../tracking/store";
import { recordAgent, type AgentQuality, type SessionTrack } from "../tracking/session-state";
import { isAgentTool } from "../runtime/is-agent-tool";

/** One classified PostToolUse call, ready to persist as freshness evidence. */
export interface AgentEvidence {
  /** Track entry name — `subagent-` + APEX phase (the reader substring-matches). */
  name: "subagent-explore-codebase" | "subagent-research-expert";
  /** `sufficient` when the call hit an MCP cache OR its response JSON is >50 chars. */
  quality: AgentQuality;
}

/**
 * `JSON.stringify` length of the raw `tool_response` OBJECT (parity Python
 * `len(str(tool_response))`); 0 when absent or unserializable (circular).
 */
function responseJsonLength(toolResponse: unknown): number {
  if (toolResponse === undefined || toolResponse === null) return 0;
  try { return (JSON.stringify(toolResponse) ?? "").length; } catch { return 0; }
}

/**
 * Classify one PostToolUse call into session evidence, or null when it is
 * neither exploration nor research (parity track-subagent-research._classify,
 * reusing the shared {@link classifyExplore} tables — research/explore/Bash/
 * cache-read). ANTI-DOUBLE-COUNT: calls classified as agent launches
 * (`Task`/`Agent`) are skipped — the existing Task tracking credits those; the
 * criterion is the CALL's classification, never its provenance (lead vs sub).
 * @param tool - Harness tool name (e.g. "Glob", "Bash", "Read").
 * @param input - Raw tool input payload.
 * @param toolResponse - Raw `tool_response` OBJECT from the hook payload.
 * @returns The evidence to record, or null to skip.
 */
export function classifyAgentEvidence(tool: string, input: Record<string, unknown> | undefined, toolResponse: unknown): AgentEvidence | null {
  if (isAgentTool(tool)) return null;
  const hit = classifyExplore(tool, input);
  if (!hit) return null;
  const name = hit.phase === "explore-codebase" ? "subagent-explore-codebase" : "subagent-research-expert";
  return { name, quality: hit.cacheHit || responseJsonLength(toolResponse) > 50 ? "sufficient" : "insufficient" };
}

/**
 * Persist evidence into the SESSION track via {@link recordAgent} — keyed by
 * `session_id` alone (sub-agent hooks carry the lead's `session_id`); the TTL
 * anchors on `ts`, the tool call's own timestamp. `agentId` is tagged as
 * metadata when present, NEVER used as a condition (unreliable field —
 * anthropics/claude-code#22348).
 * @param file - Session track file path.
 * @param evidence - Classified evidence from {@link classifyAgentEvidence}.
 * @param ts - Epoch-ms timestamp of the tool call (the hook event's `now`).
 * @param agentId - Optional Claude `agent_id` — metadata tag only.
 */
export async function recordAgentEvidence(file: string, evidence: AgentEvidence, ts: number, agentId?: string): Promise<void> {
  await withTrack(file, (track) => {
    const next = recordAgent(track, evidence.name, ts, evidence.quality);
    const last = next.agents[next.agents.length - 1];
    if (agentId && last) {
      const tagged: SessionTrack["agents"][number] & { agentId?: string } = { ...last, agentId };
      next.agents[next.agents.length - 1] = tagged;
    }
    return next;
  });
}

/**
 * Parity `_scan_agents` (apex_agent_helpers.py): reverse-scan `track.agents`,
 * STOPPING at the first entry older than `windowMs` (entries append in time
 * order), matching each required name by SUBSTRING (`research-expert` matches
 * `subagent-research-expert`) and counting ONLY `quality === "sufficient"`.
 * @param track - The loaded session track.
 * @param names - Required agent names — ALL must match to return true.
 * @param windowMs - Freshness window (ms), anchored on each entry's `ts`.
 * @param now - Current epoch ms.
 * @returns True when every required name has fresh, sufficient evidence.
 */
export function agentsFreshInTrack(track: SessionTrack, names: readonly string[], windowMs: number, now: number): boolean {
  const found = new Set<string>();
  for (let i = track.agents.length - 1; i >= 0; i--) {
    const entry = track.agents[i];
    if (!entry) continue;
    if (now - entry.ts > windowMs) break;
    if (entry.quality !== "sufficient") continue;
    for (const req of names) if (entry.name.includes(req)) found.add(req);
    if (found.size === names.length) return true;
  }
  return names.every((n) => found.has(n));
}
