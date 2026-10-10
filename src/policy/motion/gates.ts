/**
 * @module motion/gates
 * G1/G2 approval gates: a draft render needs the owner's approval of the exact
 * contact sheet; a master render (or an ffmpeg write to a declared master)
 * needs the approval of the exact draft, and respects the master-render cap.
 */
import { displayCodeForAction } from "../../runtime/confirm/confirm-code";
import type { Prompt } from "../../prompt/types";
import type { ApprovableStage, MotionCommand, MotionProject } from "../interfaces/motion";
import { listApprovals, recordPending } from "./approvals";
import { validMotionApproval } from "./auth-approval";
import { budgetLine, budgetViolation, loadBudget, maxMasterRenders } from "./budget";
import { sha256File } from "./hash";
import { readMotionState } from "./state";

const block = (reason: string): Prompt => ({ kind: "block", ruleId: "motion-approval", title: "Motion approval gate", reason });

/**
 * Evaluate the approval gates for a classified Bash command.
 * @param cmd - Classification from `classifyMotionCommand`.
 * @param project - The resolved motion project.
 * @param sessionId - Current session (binds the pending entry).
 * @param now - Epoch ms.
 * @param home - OS home (store location).
 * @param env - Environment holding `FUSE_MOTION_MAX_MASTER_RENDERS`.
 * @returns A block prompt, or `null` when the command may run.
 */
export function approvalGate(cmd: MotionCommand, project: MotionProject, sessionId: string, now: number, home: string, env: Record<string, string | undefined> = process.env): Prompt | null {
  const master = cmd.renderStage === "master" || cmd.ffmpegMaster;
  const corrupt = cmd.renderStage || master ? budgetViolation(project.root, home) : null;
  if (corrupt) return corrupt;
  const stage: ApprovableStage | null = master ? "draft" : cmd.renderStage === "draft" ? "stills" : null;
  if (!stage) return null;
  if (master && project.draft && readMotionState(project.root, home)?.coldArtifacts?.includes(project.draft)) return block("The existing cold draft is not approved. Approve stills, then complete an authorized draft render before requesting draft approval for master.");
  const artifact = stage === "draft" ? project.draft : project.contact;
  const sha = artifact ? sha256File(artifact) : null;
  if (!artifact || !sha) {
    const what = stage === "draft" ? "the draft mp4 (declare `draft` in .motion/project.json and render it)" : "the stills contact sheet (.motion/stills/contact.png)";
    return block(`Cannot approve ${stage}: ${what} does not exist yet — produce the artifact first.`);
  }
  const budget = loadBudget(project.root, home);
  const invalidated = readMotionState(project.root, home)?.invalid === true;
  if (invalidated || !listApprovals(project.root, home).some((a) => validMotionApproval(project.root, a, stage, sha, artifact, home))) {
    const stale = listApprovals(project.root, home).some((a) => a?.stage === stage);
    const code = displayCodeForAction(sha);
    // Best-effort: a store write failure (ENOTDIR, EACCES...) must never turn this refusal into an allow.
    try {
      recordPending(project.root, { stage, artifact, sha256: sha, code, createdAt: now, sessionId }, home);
    } catch {
      /* the deny below is the decision; the pending entry is only a convenience */
    }
    const why = stale ? `stale: artifact changed since approval or approval signature missing/invalid/key unreadable — re-approve required; re-approval required (${artifact})` : `no owner approval for ${stage} (${artifact}).`;
    return block(`${why}\nOwner: type MOTION-APPROVE ${stage} ${code}\n${budgetLine(budget, env)}`);
  }
  const cap = master ? maxMasterRenders(env) : 0;
  const used = budget.renders.master ?? 0;
  if (cap > 0 && used >= cap) return block(`Master render cap reached (${used}/${cap}, FUSE_MOTION_MAX_MASTER_RENDERS). ${budgetLine(budget, env)}`);
  return null;
}
