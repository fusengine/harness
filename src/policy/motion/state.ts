/** @module motion/state State-based second line; not an OS isolation boundary. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { MotionProject, MotionState } from "../interfaces/motion";
import { rootKey } from "./hash";
import { motionHome, projectStoreDir, readJsonObject, writeJsonObject } from "./store";
import { artifactState, protectedState, quarantineArtifact } from "./state-files";
import { assertMotionWitness, witnessedMotionRoots, writeMotionWitness } from "./state-witness";
import { listApprovals } from "./approvals";
import { validMotionApproval } from "./auth-approval";

const pathOf = (root: string, home: string): string => join(motionHome(home), "state", `${rootKey(root)}.json`);

/** Read a project registry; corrupt established state fails closed instead of accepting new baseline. */
export function readMotionState(root: string, home: string): MotionState | null {
  const path = pathOf(root, home);
  const recovered = assertMotionWitness(root, path, home);
  if (recovered) return recovered;
  if (!existsSync(path)) return null;
  const raw = readJsonObject(path);
  if (raw.version !== 1 || !raw.project || !Array.isArray(raw.sessions) || !raw.protected || !raw.artifacts || !raw.renders) throw new Error("Motion state registry is corrupt; owner recovery required.");
  const state = raw as unknown as MotionState;
  if (state.project.root !== root) throw new Error("Motion state registry project mismatch.");
  return state;
}

/** Persist state outside watched project store, avoiding self-invalidations. */
export function saveMotionState(state: MotionState, home: string): void {
  const path = pathOf(state.project.root, home);
  writeJsonObject(path, state);
  writeMotionWitness(state.project.root, path, state.sessions, home, state);
}

/** Locate already-observed session projects even after contract removal or cwd changes. */
export function sessionMotionStates(session: string, home: string): MotionState[] {
  return witnessedMotionRoots(session, home).map((root) => {
    const state = readMotionState(root, home);
    if (!state) throw new Error("Motion state registry missing after activation.");
    return state;
  });
}

/** Activate with a non-quarantining baseline, retaining session-to-root discovery. */
export function observeMotionProject(project: MotionProject, session: string, home: string): MotionState {
  const artifacts = artifactState(project);
  const trustedDraft = project.draft && artifacts[project.draft] && listApprovals(project.root, home).some((a) => validMotionApproval(project.root, a, "draft", artifacts[project.draft!]!, project.draft!, home));
  const state = readMotionState(project.root, home) ?? {
    version: 1, project, sessions: [], protected: protectedState(project, home),
    artifacts, renders: {}, invalid: false,
    coldArtifacts: trustedDraft ? [] : Object.entries(artifacts).filter(([, sha]) => sha !== null).map(([path]) => path),
  };
  if (!state.sessions.includes(session)) state.sessions.push(session);
  saveMotionState(state, home);
  return state;
}

/** Retain prior declarations while adding current paths; only activation may grandfather existing outputs. */
export function updateMotionDeclarations(state: MotionState, project: MotionProject, home: string): void {
  const prior = [...(state.project.draft ? [state.project.draft] : []), ...state.project.masters];
  state.project = { ...project, masters: [...new Set([...prior.filter((path) => path !== project.draft), ...project.masters])] };
  for (const path of [...(project.draft ? [project.draft] : []), ...project.masters]) if (!Object.hasOwn(state.artifacts, path)) state.artifacts[path] = null;
  saveMotionState(state, home);
}

/** Compare before harness writes; only the matching authorized completion can earn output receipts. */
export function verifyMotionState(state: MotionState, session: string, callId: string | undefined, completion: boolean, home: string, _observer = false, successful = true): string[] {
  const messages: string[] = [];
  const currentProtected = protectedState(state.project, home);
  const tampered = state.registryFault === true || JSON.stringify(currentProtected) !== JSON.stringify(state.protected);
  if (tampered) {
    state.invalid = true;
    state.renders = {};
    messages.push("Motion protected project/store/key state changed outside the harness; all approvals invalidated. Owner re-approval required.");
    try { writeJsonObject(join(projectStoreDir(state.project.root, home), "approvals.json"), { approvals: [] }); }
    catch { messages.push("Approval store cannot be cleared; durable state invalidation remains fail-closed until owner repairs storage and re-approves."); }
    state.registryFault = false;
  }
  const receipt = callId ? state.renders[callId] : undefined;
  const authorized = !tampered && completion && receipt?.session === session;
  const current = artifactState(state.project);
  if (authorized && successful) state.coldArtifacts = (state.coldArtifacts ?? []).filter((path) => (path === state.project.draft ? "draft" : "master") !== receipt.stage || current[path] === null);
  for (const [path, sha] of Object.entries(current)) {
    if (sha === state.artifacts[path]) continue;
    const stage = path === state.project.draft ? "draft" : "master";
    if (authorized && receipt.stage === stage) { state.artifacts[path] = sha; continue; }
    if (!tampered && Object.entries(state.renders).some(([id, entry]) => entry.stage === stage && !(completion && id === callId && entry.session === session))) continue;
    if (sha !== null || existsSync(path)) {
      try {
        const destination = quarantineArtifact(path, state.project.root);
        messages.push(`Motion unapproved ${stage} quarantined at ${destination}; stale: artifact changed since approval. Owner may restore it manually.`);
      } catch (error) {
        state.invalid = true;
        messages.push(`Motion QUARANTINE FAILED for ${path}: ${error instanceof Error ? error.message : String(error)}. Data preserved; owner must remove access or move it manually. Approvals invalidated.`);
        continue;
      }
    }
    state.artifacts[path] = null;
  }
  if (completion && callId) delete state.renders[callId];
  state.protected = protectedState(state.project, home);
  saveMotionState(state, home);
  return messages;
}

/** Refresh only after harness-owned writes; do not silently accept artifact changes. */
export function refreshMotionState(state: MotionState, home: string): void {
  state.protected = protectedState(state.project, home);
  saveMotionState(state, home);
}
