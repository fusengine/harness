/**
 * Platform-transcript reconciliation for `.md` reference reads — the durable
 * counterpart to {@link agentsRanFromTranscript} for agent freshness.
 *
 * WHY: the session track is persisted by a non-atomic load→mutate→save. Under
 * the multi-plugin hook fan-out (one hook process per installed plugin, ×N) plus
 * back-to-back tool events, concurrent writers clobber each other (lost update).
 * `agents`/`authorizations` self-heal — every explore/research/doc call rewrites
 * them, so a lost update lands again on the next of hundreds of writes — but a
 * `refsRead` entry is written ONCE (when the `.md` is Read), so a single lost
 * update erases it permanently, and the lead has no SubagentStop
 * {@link harvestAgentEvidence} pass to reconcile it (sub-agents do, which is why
 * only the LEAD's solidReadGate never credited). The Claude-authored transcript
 * is append-only and race-immune, so folding its `.md` Reads back into the track
 * restores the lost evidence; each gate still applies its own TTL/session policy.
 */
import { readAgentToolUses } from "../runtime/lifecycle/agent-transcript";
import { recordRefRead, type SessionTrack } from "../tracking/session-state";

/**
 * Fold every `.md` `Read` in the transcript into `track` as a timestamped ref
 * read (immutably). PURE reconciliation — the caller owns the track; each read
 * is stamped with its transcript timestamp (unstamped → `now`, lenient, matching
 * {@link agentsRanFromTranscript}), and an existing MORE-recent stamp is never
 * rolled back. Fail-open: an absent/unreadable transcript returns `track`
 * unchanged (same reference).
 * @param track - The current (possibly race-damaged) session track.
 * @param transcriptPath - Claude `transcript_path` for this session.
 * @param now - Fallback epoch-ms for transcript entries the platform left unstamped.
 * @returns The track with transcript `.md` reads merged into `refsRead`/`refsReadAt`.
 */
export function reconcileRefReadsFromTranscript(
  track: SessionTrack,
  transcriptPath: string | undefined,
  now: number,
): SessionTrack {
  const uses = readAgentToolUses(transcriptPath);
  if (!uses) return track; // unreadable → unchanged (no regression)
  let next = track;
  for (const u of uses) {
    if (u.name !== "Read") continue;
    const path = String(u.input?.file_path ?? u.input?.path ?? "");
    if (!path.endsWith(".md")) continue;
    const ts = u.ts ?? now;
    const prev = next.refsReadAt?.[path];
    if (prev === undefined || prev < ts) next = recordRefRead(next, path, ts);
  }
  return next;
}
