/**
 * @module prd-identity
 * Resolve a {@link PrdIdentity} from a normalized hook event. Structural, not
 * field-presence-based: Cursor and Kimi NEVER carry `agent_id`/`agent_type` on
 * a sub-agent's own tool-use (live-captured — see the PRD design doc Risks
 * §1/§2), so on those two targets the absence of `agentId` is NOT evidence of
 * being the lead — it is a harness ceiling, and the verdict must stay
 * `"unknown"` (advisory, never a hard block) regardless of what the payload
 * carries. Every other target (claude-code, codex, and any future harness
 * sharing their schema) DOES carry `agent_id` on a real sub-agent call, so
 * there `agentId`'s absence structurally proves "this is the lead".
 */
import type { NormalizedEvent } from "../normalize";
import type { PrdIdentity } from "../../policy/prd/interfaces/types";

/** Harness targets whose payloads never carry per-event agent identity (live-confirmed for Cursor; documented schema for Kimi — design doc Risks §1/§2). */
const NO_IDENTITY_SUPPORT: ReadonlySet<string> = new Set(["cursor", "kimi"]);

/**
 * Resolve the PRD identity of the current tool-use.
 * @param id - Harness target id (e.g. "claude-code", "codex", "cursor", "kimi").
 * @param event - The normalized hook event (reads `agentId`/`agentType`).
 * @returns The resolved {@link PrdIdentity} — `lead: "unknown"` on Cursor/Kimi,
 * `lead: true` when no `agentId` is present elsewhere, `lead: false` (with
 * whatever `agentType` came along, possibly undefined — see design Risks §4)
 * otherwise.
 */
export function resolvePrdIdentity(id: string, event: NormalizedEvent): PrdIdentity {
  if (NO_IDENTITY_SUPPORT.has(id)) return { lead: "unknown", agentId: event.agentId, agentType: event.agentType };
  if (!event.agentId) return { lead: true };
  return { lead: false, agentId: event.agentId, agentType: event.agentType };
}
