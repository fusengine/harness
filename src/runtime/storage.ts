import { projectLayout } from "../config/layout";

/**
 * The project's single state dir (`<root>/.harness`) — neutral + harness-agnostic,
 * derived from {@link projectLayout}. (Was the per-harness `.claude/harness`.)
 */
export function harnessStateDir(root: string): string {
  return projectLayout(root).stateDir;
}
