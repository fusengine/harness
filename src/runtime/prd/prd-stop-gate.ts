/**
 * @module prd-stop-gate
 * Block-once gate for the LEAD's `Stop` event when the router carries an
 * unresolved PRD cross-check violation (design doc §2.5). SYNC, same
 * one-shot idiom as {@link prdSubagentStopGate}, keyed `sessionId:Stop`
 * instead of per-agent. Covers Codex too — its `Stop` already routes to
 * `stopCore` under `scope === "core"`.
 */
import { dirname } from "node:path";
import { harnessHomeSegment } from "../../policy/apex-target";
import {
  hasAnyViolations, isPrdEnabled, prdProjectRoot, readRouterSync, readTaskFileSync,
  type PrdRouter, type PrdTaskFile,
} from "../../policy/prd";
import { journalLogPath, readTrackSync } from "../../tracking/track-compact";
import { trackJournalEnabled } from "../../tracking/store";
import { appendEvent } from "../../tracking/track-journal";
import { diffTrackEvents } from "../../tracking/track-diff";
import { prdAlreadyBlocked, recordPrdStopBlocked, type SessionTrack } from "../../tracking/session-state";
import { signTrack, writeLastNonce } from "../../tracking/integrity";
import { withTrackLockSync } from "../../tracking/track-lock-sync";
import { atomicWrite } from "../../util/json-io";
import { blockResponse } from "../../adapters/claude";
import { respond } from "../respond";

const REASON = "PRD cross-check found unresolved violation(s): a task/sub-task is marked validated without a matching done report. Run `harness prd status` for details.";

/** Sync twin of `readAllTaskFiles` (lot A only exposes the async variant). */
function readAllTaskFilesSync(root: string, homeSeg: string, router: PrdRouter): Record<string, PrdTaskFile | null> {
  const out: Record<string, PrdTaskFile | null> = {};
  for (const [task, entry] of Object.entries(router)) out[task] = readTaskFileSync(root, homeSeg, entry.prd);
  return out;
}

/**
 * Persist the one-shot block marker on the SAME side `trackJournalEnabled()`
 * reads from. Twin of `prd-subagent-stop.ts`'s own `persistStopBlocked`
 * (intentionally duplicated, not cross-imported — same SOLID file-size
 * discipline as this module's other duplicated helpers, e.g.
 * `readAllTaskFilesSync`). Bug this fixes: the old code always appended to
 * the journal regardless of mode, but `readTrackSync(file,
 * trackJournalEnabled())` never folds the log when `FUSE_TRACK_JOURNAL=0`
 * (track-compact.ts) — so a legacy replay never saw the marker and
 * re-blocked the lead's Stop on every call.
 */
function persistStopBlocked(trackFilePath: string, track: SessionTrack, key: string, now: number): void {
  if (trackJournalEnabled()) {
    const next = recordPrdStopBlocked(track, key, now);
    for (const ev of diffTrackEvents(track, next, now)) appendEvent(journalLogPath(trackFilePath), ev.field, ev.op, ev.value, ev.ts);
    return;
  }
  withTrackLockSync(dirname(trackFilePath), () => {
    const fresh = readTrackSync(trackFilePath, false); // reload under lock: avoid clobbering a concurrent legacy RMW
    const envelope = signTrack(recordPrdStopBlocked(fresh, key, now));
    atomicWrite(trackFilePath, JSON.stringify(envelope, null, 2));
    writeLastNonce(envelope.nonce);
  });
}

/**
 * Run the PRD lead-Stop block-once gate.
 * @param payload - The raw Stop hook payload.
 * @param cwd - Project root.
 * @param id - Harness target id.
 * @param trackFilePath - The session track file path.
 * @param now - Event clock.
 * @returns The native block stdout (once per session), else `""`.
 */
export function prdStopGate(payload: Record<string, unknown>, cwd: string, id: string, trackFilePath: string, now: number): string {
  if (!isPrdEnabled(cwd, id)) return "";
  if (id === "cursor") return ""; // `stop` is Cursor's terminal observation event, not gated today (design doc §5 table).
  const root = prdProjectRoot(cwd);
  const homeSeg = harnessHomeSegment(id);
  const router = readRouterSync(root, homeSeg);
  if (!router) return "";
  const track = readTrackSync(trackFilePath, trackJournalEnabled());
  // Two independent violation sources, per the design doc: (a) unresolved
  // `prdViolations` already journaled by the PostToolUse cross-check
  // (§2.2 — `hasAnyViolations` has no track access, so THIS is that half),
  // (b) `hasAnyViolations` itself — a router entry marked `validated` whose
  // task-PRD isn't actually fully validated.
  const trackHasViolations = (track.prdViolations?.length ?? 0) > 0;
  if (!trackHasViolations) {
    const taskFiles = readAllTaskFilesSync(root, homeSeg, router);
    if (!hasAnyViolations(router, taskFiles)) return "";
  }

  const sessionId = typeof payload.session_id === "string" ? payload.session_id : "unknown";
  const key = `${sessionId}:Stop`;
  if (prdAlreadyBlocked(track, key)) return "";
  persistStopBlocked(trackFilePath, track, key, now);

  // gemini-cli/cline: route through respond() for their own native block
  // envelope (see prd-subagent-stop.ts's identical routing comment for the
  // full rationale — claude-code/codex/hermes stay on blockResponse
  // unchanged, respond() cannot reproduce their byte-identical shape here).
  if (id === "kimi" || id === "gemini-cli" || id === "cline") {
    return respond(id, { kind: "block", title: "PRD cross-check", reason: REASON }, "Stop");
  }
  return blockResponse(REASON);
}
