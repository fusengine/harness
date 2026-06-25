import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { contextResponse } from "../../adapters/claude";
import { sessionsDir } from "../home-state";

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
  const sessionId = String(data.session_id ?? "unknown");
  const stateFile = join(sessionsDir(home), `session-${sessionId}-changes.json`);
  if (!existsSync(stateFile)) return "";
  try {
    const state = JSON.parse(readFileSync(stateFile, "utf-8")) as { cumulativeCodeFiles?: number; modifiedFiles?: string[] };
    const count = state.cumulativeCodeFiles ?? 0;
    if (count > 0) {
      const files = (state.modifiedFiles ?? []).slice(0, 5).join(", ");
      return contextResponse("TeammateIdle", `Teammate '${teammate}' going idle after modifying ${count} code file(s): ${files}. Consider running sniper validation.`);
    }
  } catch { /* corrupt state → emit nothing */ }
  return "";
}
