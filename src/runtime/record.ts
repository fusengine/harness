import { dirname } from "node:path";
import { loadTrack, saveTrack } from "../tracking/store";
import { recordAgent, recordDoc, recordRefRead, type AgentQuality } from "../tracking/session-state";
import { appendRefRead } from "../freshness/ref-journal";

/** A unit of session activity to record (discriminated union on `kind`). */
export type Activity =
  | { kind: "agent"; name: string; ts: number; quality?: AgentQuality }
  | { kind: "doc"; framework: string; sessionId: string; source: string; ts?: number }
  | { kind: "ref"; path: string; ts?: number };

/** Apply an activity to a session's track and persist it (PostToolUse path). */
export async function recordActivity(file: string, activity: Activity): Promise<void> {
  const track = await loadTrack(file);
  const next =
    activity.kind === "agent"
      ? recordAgent(track, activity.name, activity.ts, activity.quality)
      : activity.kind === "doc"
        ? recordDoc(track, activity.framework, activity.sessionId, activity.source, activity.ts)
        : recordRefRead(track, activity.path, activity.ts);
  await saveTrack(file, next);
  // Mirror a `.md` ref read into the append-only journal: the racy load→save above
  // loses a lone write under the hook fan-out, and a teammate's read has not yet
  // flushed to the platform transcript at edit time (multi-minute lag > TTL) — the
  // journal is the fresh, race-immune source the gate folds back (see ref-journal.ts).
  if (activity.kind === "ref") appendRefRead(dirname(file), activity.path, activity.ts ?? Date.now());
}
