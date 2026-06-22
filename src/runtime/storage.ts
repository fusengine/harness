import { join } from "node:path";
import type { HarnessId } from "../detect/harness";

/** Per-harness config dir (relative to the project root) where state lives. */
const STATE_DIR: Partial<Record<HarnessId, string>> = {
  "claude-code": ".claude",
  codex: ".codex",
  cursor: ".cursor",
  "gemini-cli": ".gemini",
  cline: ".clinerules",
};

/**
 * Directory where a harness's fuse-harness track files live — under that
 * harness's own config dir (`.claude`, `.codex`, …) so state sits next to its
 * hooks. Falls back to `.fuse-harness` for harnesses without a known config dir.
 */
export function harnessTrackDir(id: HarnessId, projectRoot: string): string {
  return join(projectRoot, STATE_DIR[id] ?? ".fuse-harness", "harness");
}
