import { tmpdir } from "node:os";
import { join } from "node:path";

/** Path to a session's track file (under a per-tool base dir). */
export function trackFile(sessionId: string, baseDir: string = join(tmpdir(), "fuse-harness")): string {
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, "_") || "default";
  return join(baseDir, `track-${safe}.json`);
}
