/**
 * @module motion/store
 * Harness-owned motion state under `~/.fuse-harness/motion/` — the ONLY trusted
 * source for gating (the project's `.motion/approvals.log` is a mirror, never
 * read). Every reader is tolerant (missing/corrupt -> empty, which the gates
 * read as "no approval" -> deny); every writer is atomic (0o600).
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { atomicWrite } from "../../util/json-io";
import { fuseHarnessHome, sanitizeSessionId } from "../../runtime/home-state";
import { rootKey } from "./hash";
import { recordObject } from "../../util/record-object";

/** Path fragment of the store — what the self-approval guard and PROTECTED_FRAGMENTS match on. */
export const MOTION_STORE_FRAGMENT = ".fuse-harness/motion";

/** Separate private signing-key directory; never part of the approval store. */
export const MOTION_KEY_FRAGMENT = ".fuse-harness/motion-keys";

/** Directory containing motion signing keys (agent reads and writes are forbidden). */
export function motionKeyDirectory(home: string = homedir()): string {
  return join(fuseHarnessHome(home), "motion-keys");
}

/** Private binary signing key for a canonical project root. */
export function motionKeyPath(root: string, home: string = homedir()): string {
  return join(motionKeyDirectory(home), `${rootKey(root)}.key`);
}

/** `~/.fuse-harness/motion` (also holds the user-level `banned.txt`). */
export function motionHome(home: string = homedir()): string {
  return join(fuseHarnessHome(home), "motion");
}

/** Per-project store dir: `~/.fuse-harness/motion/<sha256(root)[:16]>`. */
export function projectStoreDir(root: string, home: string = homedir()): string {
  return join(motionHome(home), rootKey(root));
}

/** Per-session state file (critic flag): `~/.fuse-harness/motion/sessions/<sid>.json`; `null` on an invalid id. */
export function sessionStateFile(sessionId: unknown, home: string = homedir()): string | null {
  const sid = sanitizeSessionId(sessionId);
  return sid ? join(motionHome(home), "sessions", `${sid}.json`) : null;
}

/**
 * Read a JSON object file.
 * @returns The parsed object, or `{}` when missing/corrupt/not an object.
 */
export function readJsonObject(path: string): Record<string, unknown> {
  try {
    if (!existsSync(path)) return {};
    const data: unknown = JSON.parse(readFileSync(path, "utf8"));
    return recordObject(data);
  } catch {
    return {};
  }
}

/** Atomically write a JSON object (parent created 0o700, file 0o600). */
export function writeJsonObject(path: string, data: object): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  atomicWrite(path, JSON.stringify(data, null, 2));
}

/** Read an array field of a store file (`[]` when absent/not an array). */
export function readList<T>(path: string, key: string): T[] {
  const v = readJsonObject(path)[key];
  return Array.isArray(v) ? (v as T[]) : [];
}
