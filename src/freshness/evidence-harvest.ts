/**
 * Retroactive evidence harvest at SubagentStop. Parses a completed sub-agent's
 * OWN transcript (`agent_transcript_path`) and backfills the session track with
 * the research/explore tool_use it performed (→ `agents`) and the `.md` reference
 * files it read (→ `refsReadAt`). Per LESSON.md + issues #43612/#27655/#34692,
 * sidechain PostToolUse hooks are NOT guaranteed to fire, so live in-session
 * crediting is only opportunistic; SubagentStop is dispatched by the main session
 * (reliable), and its transcript is the durable anchor this harvest reads.
 *
 * QUALITY: harvested agent evidence is credited `sufficient`. The freshness reader
 * (`agentsFreshInTrack`) ignores `insufficient` entries, so anything less would
 * make the harvest inert. This is sound: the platform-authored transcript proves
 * the tool genuinely ran to completion in a finished sub-agent — a STRONGER
 * guarantee than the live path's response-size heuristic (an anti-gaming measure
 * for the self-recorded track, which the transcript's provenance supersedes).
 */
import { classifyAgentEvidence } from "./agent-evidence-record";
import { readAgentToolUses, type TranscriptToolUse } from "../runtime/lifecycle/agent-transcript";
import { recordAgent, recordRefRead, type SessionTrack } from "../tracking/session-state";

/** Dedup tolerance (ms) against evidence a live sidechain hook may already hold. */
const DEDUP_MS = 2000;

/** True when an `agents` entry with `name` already sits within ±{@link DEDUP_MS} of `ts`. */
function agentAlreadyRecorded(track: SessionTrack, name: string, ts: number): boolean {
  return track.agents.some((a) => a.name === name && Math.abs(a.ts - ts) <= DEDUP_MS);
}

/**
 * Fold one transcript tool_use into the track (immutably): credit classified
 * research/explore evidence to `agents` (deduped, forced `sufficient`) and any
 * `.md` Read to `refsReadAt` (never restamping a MORE-recent existing read).
 * Returns the same reference when the call contributes nothing.
 */
function applyToolUse(track: SessionTrack, u: TranscriptToolUse, fallbackNow: number): SessionTrack {
  const ts = u.ts ?? fallbackNow;
  let next = track;
  const ev = classifyAgentEvidence(u.name, u.input, undefined);
  if (ev && !agentAlreadyRecorded(next, ev.name, ts)) next = recordAgent(next, ev.name, ts, "sufficient");
  if (u.name === "Read") {
    const path = String(u.input?.file_path ?? u.input?.path ?? "");
    const prev = next.refsReadAt?.[path];
    if (path.endsWith(".md") && (prev === undefined || prev < ts)) next = recordRefRead(next, path, ts);
  }
  return next;
}

/**
 * Backfill `track` from the sub-agent transcript at `transcriptPath`. PURE: the
 * caller owns load/save. Fail-open — an absent or unreadable transcript returns
 * `track` UNCHANGED (same reference), never throwing.
 * @param transcriptPath - Sub-agent's own `.jsonl` (SubagentStop `agent_transcript_path`).
 * @param track - The current session track.
 * @param now - Fallback epoch-ms for tool_uses the platform left unstamped.
 * @returns The backfilled track, or `track` itself when nothing was harvested.
 */
export function harvestAgentEvidence(transcriptPath: string | undefined, track: SessionTrack, now: number): SessionTrack {
  const uses = readAgentToolUses(transcriptPath);
  if (uses === null) return track; // unreadable → unchanged (no regression)
  return uses.reduce((acc, u) => applyToolUse(acc, u, now), track);
}
