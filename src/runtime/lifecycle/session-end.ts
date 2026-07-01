import { join } from "node:path";
import { homedir } from "node:os";
import { fusengineCache } from "../home-state";
import { removeOldFiles } from "../fs-cleanup";

/**
 * Handle SessionEnd: remove stale `*.tmp` (>1h) under `session-tmp/` and stale
 * legacy `claude_solid_reads_*` / `claude_session_changes_*` files (>2h) under
 * `cache`. Ports `session-end/cleanup-session.py`. No stdout.
 * @param home - Home dir (defaults to `~`).
 * @param now - Clock (defaults to `Date.now()`).
 */
export function cleanupSession(home: string = homedir(), now: number = Date.now()): void {
  const base = fusengineCache(home);
  removeOldFiles(join(base, "session-tmp"), (n) => n.endsWith(".tmp"), 3600, now);
  removeOldFiles(base, (n) => n.startsWith("claude_solid_reads_") || n.startsWith("claude_session_changes_"), 7200, now);
}
