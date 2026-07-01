import { loadTrack, saveTrack } from "../tracking/store";
import { recordAgent, recordDoc, recordRefRead, type AgentQuality } from "../tracking/session-state";

/** A unit of session activity to record (discriminated union on `kind`). */
export type Activity =
  | { kind: "agent"; name: string; ts: number; quality?: AgentQuality }
  | { kind: "doc"; framework: string; sessionId: string; source: string }
  | { kind: "ref"; path: string; ts?: number };

/** Apply an activity to a session's track and persist it (PostToolUse path). */
export async function recordActivity(file: string, activity: Activity): Promise<void> {
  const track = await loadTrack(file);
  const next =
    activity.kind === "agent"
      ? recordAgent(track, activity.name, activity.ts, activity.quality)
      : activity.kind === "doc"
        ? recordDoc(track, activity.framework, activity.sessionId, activity.source)
        : recordRefRead(track, activity.path, activity.ts);
  await saveTrack(file, next);
}
