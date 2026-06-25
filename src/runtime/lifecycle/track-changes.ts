import { basename } from "node:path";
import { homedir } from "node:os";
import { contextResponse } from "../../adapters/claude";
import { loadSessionState, sanitizeSessionId, saveSessionState } from "../home-state";

/** Code-file extensions tracked for sniper (mirrors track-session-changes.py). */
const CODE_EXT = /\.(ts|tsx|js|jsx|py|go|rs|java|php|cpp|c|rb|swift|kt|vue|svelte|astro)$/;

/** Shape of the `changes` block persisted in per-session state. */
interface Changes {
  cumulativeCodeFiles: number;
  modifiedFiles: string[];
  lastModifiedFile?: string;
  lastCheck?: string;
}

/**
 * Handle PostToolUse Write/Edit: track the cumulative set of modified code
 * files per session and emit the mandatory "SNIPER VALIDATION REQUIRED"
 * additionalContext. Ports `post-tool-use/track-session-changes.py`.
 * @param sessionIdRaw - Raw session id from the payload.
 * @param filePath - The edited file path.
 * @param home - Home dir (defaults to `~`).
 * @param now - Clock (defaults to `Date.now()`).
 * @returns The native hook stdout (possibly empty when not a code file).
 */
export function trackSessionChanges(sessionIdRaw: unknown, filePath: string, home: string = homedir(), now: number = Date.now()): string {
  if (!filePath || !CODE_EXT.test(filePath)) return "";
  const sid = sanitizeSessionId(sessionIdRaw) ?? "unknown";
  const state = loadSessionState(sid, home);
  const prev = (state.changes as Changes | undefined) ?? { cumulativeCodeFiles: 0, modifiedFiles: [] };
  const files = [...prev.modifiedFiles];
  let count = prev.cumulativeCodeFiles;
  if (!files.includes(filePath)) { count += 1; files.push(filePath); }
  state.changes = {
    cumulativeCodeFiles: count,
    modifiedFiles: files,
    lastModifiedFile: filePath,
    lastCheck: new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z"),
  } satisfies Changes;
  saveSessionState(sid, state, home);
  const fname = basename(filePath);
  return contextResponse(
    "PostToolUse",
    `SNIPER VALIDATION REQUIRED: Code file '${fname}' was modified. You MUST now run the sniper agent (fuse-ai-pilot:sniper) to validate this modification before continuing. This is mandatory per CLAUDE.md rules.`,
  );
}
