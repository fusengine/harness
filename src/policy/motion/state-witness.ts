/** @module motion/state-witness Independent session witnesses for missing/replaced registries. */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { motionHome, motionKeyPath, readJsonObject, sessionStateFile, writeJsonObject } from "./store";
import { stateFingerprint } from "./state-files";
import type { MotionState } from "../interfaces/motion";
import { isRecordObject, recordObject } from "../../util/record-object";
import { rootKey } from "./hash";

const grantsRegistry = (root: string, home: string): string => join(motionHome(home), "state", `${rootKey(root)}.grants.json`);

/** Register a genuine harness grant independently of the initially observed project store, without session expiry. */
export function recordMotionGrant(root: string, signature: string, home: string): void {
  const path = grantsRegistry(root, home);
  const raw = readJsonObject(path);
  const grants = recordObject(raw.grants);
  writeJsonObject(path, { root, grants: { ...grants, [signature]: stateFingerprint(motionKeyPath(root, home)) } });
}

/** Require independently registered signature and unchanged signing-key kernel identity/content. */
export function registeredMotionGrant(root: string, signature: string, home: string): boolean {
  const raw = readJsonObject(grantsRegistry(root, home));
  return raw.root === root && recordObject(raw.grants)[signature] === stateFingerprint(motionKeyPath(root, home));
}

/** Session-observed roots survive removal of project.json or the main state registry. */
export function witnessedMotionRoots(session: string, home: string): string[] {
  const file = sessionStateFile(session, home);
  const roots = file ? readJsonObject(file).motionStates : undefined;
  return isRecordObject(roots, true) ? Object.keys(roots) : [];
}

/** Check an independent saved kernel fingerprint before trusting registry contents. */
export function assertMotionWitness(root: string, registry: string, home: string): MotionState | null {
  let names: string[];
  const directory = join(motionHome(home), "sessions");
  try { names = readdirSync(directory); } catch { return null; }
  const actual = stateFingerprint(registry);
  for (const name of names.filter((entry) => entry.endsWith(".json"))) {
    const states = readJsonObject(join(directory, name)).motionStates;
    if (!isRecordObject(states, true)) continue;
    const expected = states[root];
    if (isRecordObject(expected, true)) {
      const witness = expected as { fingerprint?: string; state?: MotionState };
      if (witness.fingerprint !== actual && witness.state?.project.root === root) return { ...witness.state, registryFault: true, invalid: true, renders: {} };
    } else if (typeof expected === "string" && expected !== actual) throw new Error("Motion state registry missing or externally replaced; owner recovery required.");
  }
  return null;
}

/** Refresh witnesses after a harness registry write, preserving critic bookkeeping. */
export function writeMotionWitness(root: string, registry: string, sessions: string[], home: string, state: MotionState): void {
  const fingerprint = stateFingerprint(registry);
  for (const session of sessions) {
    const file = sessionStateFile(session, home);
    if (!file) continue;
    const raw = readJsonObject(file);
    const states = recordObject(raw.motionStates, true);
    writeJsonObject(file, { ...raw, motionStates: { ...states, [root]: { fingerprint, state } } });
  }
}
