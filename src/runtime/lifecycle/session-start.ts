import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { attachSystemMessage, contextResponse } from "../../adapters/claude";
import { claudeHome, fusengineCache, sessionsDir } from "../home-state";
import { devContext } from "../dev-context";
import { pruneEmptyDirs, purgeTtlTree, removeOldFiles, trimLogFile } from "../fs-cleanup";
import { apexDocName, harnessHomeSegment } from "../../policy/apex-target";

/** TTLs (seconds) for purgeable cache subtrees (cleanup-old-caches.py). */
const PURGEABLE: Record<string, number> = { sessions: 48 * 3600, webfetch: 24 * 3600, doc: 48 * 3600, explore: 48 * 3600 };

/**
 * Read the target's root instructions doc (`~/.claude/CLAUDE.md`,
 * `~/.codex/AGENTS.md`, `~/.kimi-code/AGENTS.md`, ...), or "" when
 * missing/unreadable.
 * @param home - Home dir.
 * @param id - Harness target id (defaults to "claude-code" — zero-regression default).
 */
function claudeMd(home: string, id: string = "claude-code"): string {
  const path = join(home, harnessHomeSegment(id), apexDocName(id));
  try {
    return existsSync(path) ? readFileSync(path, "utf-8") : "";
  } catch {
    return "";
  }
}

/** Run the legacy SessionStart cleanups (stale states, caches, log trim). */
export function runSessionStartCleanups(home: string = homedir(), now: number = Date.now()): void {
  const base = fusengineCache(home);
  removeOldFiles(sessionsDir(home), (n) => n.startsWith("session-") && n.endsWith(".json"), 86400, now);
  const user = process.env.USER ?? "unknown";
  removeOldFiles(base, (n) => n === `changes-${user}.json`, 21600, now);
  trimLogFile(join(claudeHome(home), "logs", "hooks.log"), 10485760, 5000);
  removeOldFiles(join(claudeHome(home), "logs", "00-apex"), (n) => n.startsWith("ref-cache-") && n.endsWith(".json"), 86400, now);
  purgeTtlTree(base, PURGEABLE, now);
  pruneEmptyDirs(base, Object.keys(PURGEABLE));
}

/**
 * Handle core-guards SessionStart: inject CLAUDE.md + dev context as
 * `additionalContext`, then run the cache/state cleanups. Ports the four
 * `session-start/*.py` scripts into one harness call.
 * @param cwd - Project root for dev-context detection.
 * @param home - Home dir (defaults to `~`).
 * @param now - Clock for TTL cleanup (defaults to `Date.now()`).
 * @param id - Harness target id (defaults to "claude-code" — zero-regression default).
 * @returns The native hook stdout (possibly empty).
 */
export function sessionStartCore(cwd: string, home: string = homedir(), now: number = Date.now(), id: string = "claude-code"): string {
  const md = claudeMd(home, id);
  const dev = devContext(cwd);
  runSessionStartCleanups(home, now);
  const ctx = [md, dev].filter(Boolean).join("\n");
  return ctx ? attachSystemMessage(contextResponse("SessionStart", ctx), `${apexDocName(id)} injected`) : "";
}
