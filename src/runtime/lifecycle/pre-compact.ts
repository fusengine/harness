import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Two-digit zero-pad. */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Compact local timestamp `YYYYMMDD-HHMMSS` (mirrors Python strftime). */
function stamp(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Handle PreCompact: back up `.claude/apex/task.json` to `backups/`, keep only
 * the 5 newest, and emit a confirmation. Ports `pre-compact/save-apex-state.py`.
 * @param cwd - Project root.
 * @param now - Clock (defaults to `Date.now()`).
 * @returns The native hook stdout (possibly empty when no task.json).
 */
export function saveApexState(cwd: string, now: number = Date.now()): string {
  const apexDir = join(cwd, ".claude", "apex");
  const stateFile = join(apexDir, "task.json");
  if (!existsSync(stateFile)) return "";
  const backupDir = join(apexDir, "backups");
  mkdirSync(backupDir, { recursive: true });
  copyFileSync(stateFile, join(backupDir, `task-${stamp(now)}.json`));
  const backups = readdirSync(backupDir).filter((n) => n.startsWith("task-") && n.endsWith(".json")).sort().reverse();
  for (const old of backups.slice(5)) {
    try { rmSync(join(backupDir, old), { force: true }); } catch { /* best effort */ }
  }
  return JSON.stringify({ additionalContext: "APEX state saved before compaction. Previous task state preserved in .claude/apex/backups/" });
}
