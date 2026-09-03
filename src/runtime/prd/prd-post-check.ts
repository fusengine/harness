/**
 * @module prd-post-check
 * PostToolUse cross-check (design doc §2.2). Side-effect only — never
 * produces stdout. Fires only when the touched path just resolved to a
 * task-PRD or the router (the only two places a `validated` status is
 * asserted), reloads every named agent's own report, and journals any NEW
 * cross-check violation (deduped by `{task,agent,sub,reason}` so a repeated
 * PostToolUse on the same file never re-appends the same finding).
 */
import { hashText } from "../../util/json-io";
import { harnessHomeSegment } from "../../policy/apex-target";
import {
  classifyPrdPath, crossCheckTask, isPrdEnabled, prdProjectRoot,
  readAgentReport, readRouter, readTaskFile,
  type PrdAgentReportFile, type PrdCrossCheckViolation,
} from "../../policy/prd";
import { withTrack } from "../../tracking/store";
import { recordPrdViolation } from "../../tracking/session-state";
import { prdCandidateFiles } from "./prd-candidate-files";
import { canonicalFilePath, canonicalRoot } from "./prd-canon";
import type { NormalizedEvent } from "../normalize";

/** Stable dedup key for one violation, shared across replays of the same PostToolUse. */
function violationKey(v: PrdCrossCheckViolation): string {
  return hashText(JSON.stringify([v.task, v.agent, v.sub, v.reason]));
}

/**
 * Run the PRD PostToolUse cross-check. Side-effect only — journals new
 * violations, never returns anything to render.
 */
export async function prdPostCheck(id: string, event: NormalizedEvent, cwd: string, trackFilePath: string, now: number): Promise<void> {
  if (!isPrdEnabled(cwd, id)) return;
  const root = canonicalRoot(prdProjectRoot(cwd)); // see prd-canon.ts — same representation as the candidate file paths below
  const homeSeg = harnessHomeSegment(id);
  const router = await readRouter(root, homeSeg);
  if (!router) return;

  const files = prdCandidateFiles(event, false).map(canonicalFilePath);
  const touchedTasks = new Set<string>();
  for (const f of files) {
    const kind = classifyPrdPath(f, root, homeSeg, router);
    if (kind?.kind === "task") touchedTasks.add(kind.task);
    else if (kind?.kind === "router") for (const task of Object.keys(router)) touchedTasks.add(task);
  }
  if (touchedTasks.size === 0) return;

  const violations: PrdCrossCheckViolation[] = [];
  for (const task of touchedTasks) {
    const entry = router[task];
    if (!entry) continue;
    const taskFile = await readTaskFile(root, homeSeg, entry.prd);
    if (!taskFile) continue;
    const reports: Record<string, PrdAgentReportFile> = {};
    for (const agent of Object.keys(taskFile)) {
      const report = await readAgentReport(root, homeSeg, agent);
      if (report) reports[agent] = report;
    }
    violations.push(...crossCheckTask(taskFile, reports, task));
  }
  if (violations.length === 0) return;

  await withTrack(trackFilePath, (t) => {
    const known = new Set((t.prdViolations ?? []).map(violationKey));
    let next = t;
    for (const v of violations) {
      if (known.has(violationKey(v))) continue;
      known.add(violationKey(v));
      next = recordPrdViolation(next, { ...v, ts: now });
    }
    return next;
  });
}
