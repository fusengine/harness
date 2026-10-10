import { homedir } from "node:os";
import type { MotionCall } from "../../policy/interfaces/motion";
import { grantPending, dropPending, listApprovals, findPendingRoots, listPending } from "../../policy/motion/approvals";
import { validMotionApproval } from "../../policy/motion/auth-approval";
import { parseMotionApprove, isHumanPrompt } from "../../policy/motion/approve-prompt";
import { sha256File } from "../../policy/motion/hash";
import { loadMotionProject } from "../../policy/motion/project";
import { REFUSAL_RE } from "../confirm/confirm-submit";
import type { HandleOptions } from "../handle-types";
import { motionContext } from "./reply";
import { readMotionState, refreshMotionState } from "../../policy/motion/state";
import { projectStoreDir, writeJsonObject } from "../../policy/motion/store";
import { join } from "node:path";

/**
 * UserPromptSubmit: a refusal drops the session's pending approvals; an exact
 * human `MOTION-APPROVE <stage> <code>` prompt is turned into an approval bound
 * to the CURRENT artifact hash. Invalid well-formed approvals return explicit
 * rejection context, except Cursor's beforeSubmitPrompt (no documented
 * non-blocking informative channel); unrelated, automated, and refusal prompts return "".
 * @param id - Harness id.
 * @param payload - Raw hook payload.
 * @param call - Host call (prompt text already extracted from the host's own field).
 * @param sessionId - Normalized session id.
 * @param opts - Handler options (cwd, now, home).
 */
export function motionPrompt(id: string, payload: Record<string, unknown>, call: MotionCall, sessionId: string, opts: HandleOptions): string {
  const home = opts.home ?? homedir();
  const text = call.text;
  if (!call.human || !isHumanPrompt(payload, text)) return "";
  const parsed = parseMotionApprove(text);
  const candidates = findPendingRoots(sessionId, home).filter((root) => !parsed || listPending(root, home).some((p) => p.stage === parsed.stage && p.code.toLowerCase() === parsed.code));
  const project = candidates.length === 1 ? loadMotionProject(candidates[0]!, home) : loadMotionProject(opts.cwd, home);
  if (!project || (parsed && candidates.length > 1)) return parsed ? motionContext(id, call.respondAs, "Motion approval not granted", "No unique pending motion project matches this session and code; request the stage again from the project directory.") : "";
  if (REFUSAL_RE.test(text)) {
    dropPending(project.root, sessionId, home);
    return "";
  }
  if (!parsed) return "";
  const artifact = parsed.stage === "stills" ? project.contact : project.draft;
  const sha = artifact ? sha256File(artifact) : null;
  const priorState = readMotionState(project.root, home);
  if (priorState?.invalid) writeJsonObject(join(projectStoreDir(project.root, home), "approvals.json"), { approvals: [] });
  const approval = artifact ? grantPending(project.root, sessionId, parsed.stage, parsed.code, sha, opts.now, home) : null;
  if (!approval) {
    // Hermes replays the same user message before each LLM call in a turn.
    if (id === "hermes" && artifact && sha && listApprovals(project.root, home).some((a) =>
      a?.sessionId === sessionId && a.code === parsed.code && validMotionApproval(project.root, a, parsed.stage, sha, artifact, home))) return "";
    // Cursor documents user_message only when beforeSubmitPrompt blocks.
    // Keep invalid approvals silent rather than refuse the owner's prompt.
    if (id === "cursor" && call.respondAs === "beforeSubmitPrompt") return "";
    return motionContext(id, call.respondAs, "Motion approval not granted", "Motion approval not granted: no matching pending approval for this session, stage, code, and current artifact. No approval was recorded; request the stage again for a current approval code.");
  }
  const state = readMotionState(project.root, home);
  if (state) { state.invalid = false; refreshMotionState(state, home); }
  return motionContext(id, call.respondAs, "Motion approval", `Motion: stage "${approval.stage}" approved for ${approval.artifact} (sha ${approval.sha256.slice(0, 8)}). The next stage may now run.`);
}
