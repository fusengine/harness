/**
 * @module motion/approvals
 * Approval + pending bookkeeping in the harness-owned store. Only
 * {@link grantPending} (reached solely from the human UserPromptSubmit path)
 * ever writes an approval.
 */
import { appendFileSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { motionHome, projectStoreDir, readJsonObject, readList, writeJsonObject } from "./store";
import { rootKey } from "./hash";
import { LOCK_FAILED } from "../../tracking/track-lock-sync";
import { withMotionProjectLock } from "./project-lock";
import type { ApprovableStage, MotionApproval, MotionPending } from "../interfaces/motion";
import { signMotionApproval } from "./auth-approval";

const approvalsPath = (root: string, home: string): string => join(projectStoreDir(root, home), "approvals.json");
const pendingPath = (root: string, home: string): string => join(projectStoreDir(root, home), "pending.json");

/** Every recorded approval of a project (`[]` when none/corrupt). */
export function listApprovals(root: string, home: string = homedir()): MotionApproval[] {
  return readList<MotionApproval>(approvalsPath(root, home), "approvals");
}

/** Pending approvals of a project (`[]` when none/corrupt). */
export function listPending(root: string, home: string = homedir()): MotionPending[] {
  return readList<MotionPending>(pendingPath(root, home), "pending");
}

/** Record (or replace) the pending approval of `entry.stage` for `entry.sessionId`. */
export function recordPending(root: string, entry: MotionPending, home: string = homedir()): void {
  const result = withMotionProjectLock(root, home, () => {
    const rest = listPending(root, home).filter((p) => !(p?.stage === entry.stage && p.sessionId === entry.sessionId));
    writeJsonObject(pendingPath(root, home), { root, pending: [...rest, entry] });
  });
  if (result === LOCK_FAILED) throw new Error("Motion approval lock busy; pending request was not recorded.");
}

/** Drop every pending approval of a session (an explicit refusal). */
export function dropPending(root: string, sessionId: string, home: string = homedir()): void {
  const result = withMotionProjectLock(root, home, () => {
    const all = listPending(root, home);
    const rest = all.filter((p) => p?.sessionId !== sessionId);
    if (rest.length !== all.length) writeJsonObject(pendingPath(root, home), { root, pending: rest });
  });
  if (result === LOCK_FAILED) throw new Error("Motion approval lock busy; pending refusal was not recorded.");
}

/** Find projects with pending requests for this session, independent of the prompt cwd; validate directory binding. */
export function findPendingRoots(sessionId: string, home: string = homedir()): string[] {
  let names: string[];
  try { names = readdirSync(motionHome(home)); } catch { return []; }
  return names.flatMap((name) => {
    const raw = readJsonObject(join(motionHome(home), name, "pending.json"));
    if (typeof raw.root !== "string" || rootKey(raw.root) !== name) return [];
    return listPending(raw.root, home).some((p) => p?.sessionId === sessionId) ? [raw.root] : [];
  });
}

/**
 * Turn a matching pending entry into an approval: same session, same stage,
 * same display code, AND the artifact still hashes to what the deny showed.
 * @param currentSha - The artifact's hash right now (`null` = missing -> no grant).
 * @returns The written approval, or `null` when nothing matched.
 */
export function grantPending(root: string, sessionId: string, stage: ApprovableStage, code: string, currentSha: string | null, now: number, home: string = homedir()): MotionApproval | null {
  if (!currentSha) return null;
  const result = withMotionProjectLock(root, home, () => {
    const pending = listPending(root, home);
    const hit = pending.find((p) => p?.sessionId === sessionId && p.stage === stage && String(p.code).toLowerCase() === code.toLowerCase() && p.sha256 === currentSha);
    if (!hit) return null;
    const approval = signMotionApproval(root, { stage, artifact: hit.artifact, sha256: hit.sha256, code: hit.code, approvedAt: now, sessionId }, home);
    if (!approval) return null;
    writeJsonObject(approvalsPath(root, home), { approvals: [...listApprovals(root, home), approval] });
    writeJsonObject(pendingPath(root, home), { root, pending: pending.filter((p) => p !== hit) });
    mirrorLog(root, approval);
    return approval;
  });
  if (result === LOCK_FAILED) throw new Error("Motion approval lock busy; approval was not granted.");
  return result;
}

/** Append a human-readable line to `.motion/approvals.log` — a mirror, NEVER read for gating. */
function mirrorLog(root: string, a: MotionApproval): void {
  try {
    mkdirSync(join(root, ".motion"), { recursive: true });
    appendFileSync(join(root, ".motion", "approvals.log"), `${new Date(a.approvedAt).toISOString()} ${a.stage} ${a.sha256} ${a.artifact}\n`);
  } catch {
    /* mirror only — never blocks the approval */
  }
}
