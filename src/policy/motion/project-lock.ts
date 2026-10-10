/** @module motion/project-lock — one lock for project approvals and render budgets. */
import { mkdirSync } from "node:fs";
import { withTrackLockSyncBlocking } from "../../tracking/track-lock-sync";
import { projectStoreDir } from "./store";
import type { LOCK_FAILED } from "../../tracking/track-lock-sync";

/** Run one project read/modify/write transaction; callers must not acquire it recursively. */
export function withMotionProjectLock<T>(root: string, home: string, fn: () => T): T | typeof LOCK_FAILED {
  const dir = projectStoreDir(root, home);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return withTrackLockSyncBlocking(dir, fn);
}
