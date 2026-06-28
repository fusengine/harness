/**
 * Salience + severity scoring for the memory-neural scope. Ports the
 * `_severity` / `_agent_severity` helpers and the shared salience formula from
 * `auto-capture-error.py` and `capture-agent-lesson.py`.
 */

/** Episodes at or below this salience are not stored. */
export const SALIENCE_THRESHOLD = 0.3;

/** Severity (1-10) of a Bash stderr by keyword (mirrors auto-capture-error). */
export function bashSeverity(stderr: string): number {
  const s = stderr.toLowerCase();
  if (s.includes("fatal") || s.includes("panic")) return 10;
  if (s.includes("error") || s.includes("failed")) return 8;
  if (s.includes("warning")) return 4;
  if (s.includes("deprecated")) return 2;
  return 5;
}

/** Severity (1-10) of a finished agent by name (mirrors capture-agent-lesson). */
export function agentSeverity(name: string): number {
  if (name === "sniper" || name === "sniper-faster") return 8;
  if (name === "research-expert") return 6;
  if (name.endsWith("-expert")) return 7;
  return 5;
}

/** Salience from severity: 0.40·sev/10 + 0.30 + 0.20·0.5 + 0.10·0.5. */
export function salience(severity: number): number {
  return (0.4 * severity) / 10 + 0.3 + 0.2 * 0.5 + 0.1 * 0.5;
}
