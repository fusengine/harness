/** @module motion/state-files Protected-state fingerprints and non-destructive quarantine. */
import { lstatSync, mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { canonicalFilePath } from "../../runtime/prd/prd-canon";
import { sha256File } from "./hash";
import { motionKeyPath, projectStoreDir } from "./store";
import type { MotionProject } from "../interfaces/motion";
import { isUnder } from "./paths";

/** Kernel identity and content hash; missing files remain represented explicitly. */
export function stateFingerprint(path: string): string {
  try {
    const s = lstatSync(path, { bigint: true });
    return `${s.dev}:${s.ino}:${s.ctimeNs}:${s.size}:${s.mode}:${s.isFile() ? sha256File(path) : s.isSymbolicLink() ? canonicalFilePath(path) : "directory"}`;
  } catch { return "missing"; }
}

/** Snapshot the owner contract, private key, and recursively every stable store entry. */
export function protectedState(project: MotionProject, home: string): Record<string, string> {
  const result: Record<string, string> = {};
  const seen = new Set<string>();
  const visit = (path: string): void => {
    if (seen.has(path)) return;
    seen.add(path);
    result[path] = stateFingerprint(path);
    try {
      if (lstatSync(path).isSymbolicLink()) { visit(canonicalFilePath(path)); return; }
      if (!lstatSync(path).isDirectory()) return;
      // Directory ctime changes with harness lock files; child identities detect replacement.
      const s = statSync(path, { bigint: true });
      result[path] = `${s.dev}:${s.ino}:${s.birthtimeNs}`;
      for (const name of readdirSync(path).sort()) if (name !== "track.lock") visit(join(path, name));
    } catch { /* missing is part of the fingerprint */ }
  };
  visit(join(project.root, ".motion/project.json"));
  visit(motionKeyPath(project.root, home));
  visit(projectStoreDir(project.root, home));
  return result;
}

/** Full content hashes keyed by declared lexical paths (realpath resolves case and links). */
export function artifactState(project: MotionProject): Record<string, string | null> {
  return Object.fromEntries([...(project.draft ? [project.draft] : []), ...project.masters].map((path) => {
    const sha = sha256File(canonicalFilePath(path));
    const fingerprint = stateFingerprint(path);
    return [path, sha ?? (fingerprint === "missing" ? null : `unhashable:${fingerprint}`)];
  }));
}

/** Move an unapproved artifact and any alias into quarantine, never delete user data. */
export function quarantineArtifact(path: string, root: string): string {
  const directory = join(root, ".motion/quarantine");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!isUnder(canonicalFilePath(directory), canonicalFilePath(root))) throw new Error("Motion quarantine directory escapes the project through a symlink.");
  let destination = join(directory, `${Date.now()}-${randomUUID()}-${basename(path)}`);
  const real = canonicalFilePath(path);
  const link = lstatSync(path).isSymbolicLink();
  try { renameSync(real, destination); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    // Keep the target on its source filesystem: no copy/delete fallback or data loss.
    const local = join(dirname(real), ".motion-quarantine");
    mkdirSync(local, { recursive: true, mode: 0o700 });
    if (canonicalFilePath(local) !== local) throw new Error("Source-filesystem quarantine has an unsafe symlink alias.");
    destination = join(local, `${Date.now()}-${randomUUID()}-${basename(real)}`);
    renameSync(real, destination);
  }
  if (link && real !== path) renameSync(path, join(directory, `${Date.now()}-${randomUUID()}-${basename(path)}.alias`));
  return destination;
}
