/**
 * Per-project lessons paths. The `fuse-lessons` plugin stores its lessons under
 * `<root>/MEMORY/` (NOT the harness `.harness/memory/`), so these two path
 * helpers override the layout while ALL state/gitignore/throttle logic is
 * reused from `src/memory` (`setStateField`, `ensureMemoryGitignore`,
 * `readState`, `nowStamp`, `throttleMs`).
 */
import { join } from "node:path";

/** Absolute `<root>/MEMORY/LESSON.md` — the curated, committable lessons file. */
export function lessonsFileFor(root: string): string {
  return join(root, "MEMORY", "LESSON.md");
}

/** Absolute `<root>/MEMORY/state.json` — machine-local throttle counter. */
export function lessonsStateFileFor(root: string): string {
  return join(root, "MEMORY", "state.json");
}
