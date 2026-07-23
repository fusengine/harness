/**
 * SubagentStop wiring for {@link harvestAgentEvidence}. The core SubagentStop
 * dispatch (`runtime/lifecycle/dispatch.ts`) is SYNCHRONOUS and runs in a
 * short-lived hook process, so this does SYNC track I/O (load → harvest → save)
 * rather than the async `loadTrack`/`saveTrack`: a floating async write could be
 * dropped before the process exits. Mirrors the sync read precedent in
 * `policy/design/skill-evidence.ts` and the exact save body of `tracking/store.ts`
 * (`signTrack` → atomic write → `writeLastNonce`) — kept sync on purpose here.
 */
import { readFileSync } from "node:fs";
import { harvestAgentEvidence } from "./evidence-harvest";
import { defaultStateDir, trackFile } from "../runtime/paths";
import { emptyTrack, type SessionTrack } from "../tracking/session-state";
import { signTrack, verifyTrack, writeLastNonce, type TrackEnvelope } from "../tracking/integrity";
import { atomicWrite } from "../util/json-io";
import { LOCK_FAILED, withTrackLockSync } from "../tracking/track-lock-sync";
import { dirname } from "node:path";

/** Load the current track synchronously; `emptyTrack()` when absent/corrupt (fail-closed read). */
function loadTrackSync(file: string): SessionTrack {
  try {
    return verifyTrack(JSON.parse(readFileSync(file, "utf8")) as TrackEnvelope) ?? emptyTrack();
  } catch {
    return emptyTrack();
  }
}

/**
 * Harvest the finishing sub-agent's transcript into its session track. Runs for
 * EVERY agent type (unlike the sniper reminder, which skips research/explore) —
 * those are exactly the agents whose research/explore evidence we want to credit.
 * Fully fail-open: a missing `agent_transcript_path`, an unreadable transcript, or
 * a write error leaves the track untouched and never throws out of the hook.
 * @param payload - The raw SubagentStop hook payload.
 * @param cwd - Project root (selects the per-project state dir).
 * @param now - Fallback epoch-ms for unstamped transcript tool_uses.
 * @param baseDir - Override the track base dir (tests); defaults to the project state dir.
 */
export function harvestSubagentTrack(payload: Record<string, unknown>, cwd: string, now: number, baseDir: string = defaultStateDir(cwd)): void {
  const transcriptPath = typeof payload.agent_transcript_path === "string" ? payload.agent_transcript_path : undefined;
  if (!transcriptPath) return;
  const sessionId = typeof payload.session_id === "string" ? payload.session_id : "unknown";
  const file = trackFile(sessionId, baseDir);
  // Locked RMW (sync variant — this path cannot float async work): on
  // contention the harvest is skipped like any other write error, fail-open.
  const ran = withTrackLockSync(dirname(file), () => {
    const track = loadTrackSync(file);
    const next = harvestAgentEvidence(transcriptPath, track, now);
    if (next === track) return; // nothing harvested (or unreadable) → no rewrite
    try {
      const envelope = signTrack(next);
      atomicWrite(file, JSON.stringify(envelope, null, 2));
      writeLastNonce(envelope.nonce);
    } catch { /* fail-open: a lifecycle hook must never throw */ }
  });
  if (ran === LOCK_FAILED) return;
}
