import { homedir } from "node:os";
import { loadSessionState, sanitizeSessionId } from "../home-state";

/** The `changes` block written by `track-changes.ts` into unified session state. */
interface Changes {
  cumulativeCodeFiles?: number;
  modifiedFiles?: string[];
}

/**
 * Handle TeammateIdle: when the teammate's session-changes file shows code was
 * modified, suggest sniper validation as plain text — TeammateIdle has no
 * `additionalContext` channel (rejects `hookSpecificOutput`), so the caller
 * ({@link module:teammate-idle-check.teammateIdleContext}) rides this text on
 * the `systemMessage` channel instead. Ports `teammate-idle/validate-teammate-output.py`.
 * @param data - The raw hook payload.
 * @param home - Home dir (defaults to `~`).
 * @returns The plain notice text, or "" when no code file was modified.
 */
export function validateTeammateOutput(data: Record<string, unknown>, home: string = homedir()): string {
  const teammate = String(data.teammate_name ?? "unknown");
  const sessionId = sanitizeSessionId(data.session_id) ?? "unknown";
  const changes = loadSessionState(sessionId, home).changes as Changes | undefined;
  const count = changes?.cumulativeCodeFiles ?? 0;
  if (count === 0) return "";
  const files = (changes?.modifiedFiles ?? []).slice(0, 5).join(", ");
  return `Teammate '${teammate}' going idle after modifying ${count} code file(s): ${files}. Consider running sniper validation.`;
}
