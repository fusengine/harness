import { homedir } from "node:os";
import { contextResponse } from "../../adapters/claude";
import { loadSessionState, sanitizeSessionId } from "../home-state";

/** The `changes` block written by `track-changes.ts` into unified session state. */
interface Changes {
  cumulativeCodeFiles?: number;
  modifiedFiles?: string[];
}

/**
 * Handle TeammateIdle: when the teammate's session-changes file shows code was
 * modified, suggest sniper validation as `additionalContext`. Ports
 * `teammate-idle/validate-teammate-output.py`.
 * @param data - The raw hook payload.
 * @param home - Home dir (defaults to `~`).
 * @returns The native hook stdout (possibly empty).
 */
export function validateTeammateOutput(data: Record<string, unknown>, home: string = homedir()): string {
  const teammate = String(data.teammate_name ?? "unknown");
  const sessionId = sanitizeSessionId(data.session_id) ?? "unknown";
  const changes = loadSessionState(sessionId, home).changes as Changes | undefined;
  const count = changes?.cumulativeCodeFiles ?? 0;
  if (count > 0) {
    const files = (changes?.modifiedFiles ?? []).slice(0, 5).join(", ");
    return contextResponse("TeammateIdle", `Teammate '${teammate}' going idle after modifying ${count} code file(s): ${files}. Consider running sniper validation.`);
  }
  return "";
}
