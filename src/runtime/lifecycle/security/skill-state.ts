/**
 * Shared security-tracker state: per-UTC-day JSON under
 * `~/.claude/logs/00-security`. Ports the state helpers of
 * `check-security-skill.py` / `track-skill-read.py` / `track-mcp-research.py`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { claudeHome } from "../../home-state";

/** `~/.claude/logs/00-security` state directory. */
export function securityStateDir(home: string = homedir()): string {
  return join(claudeHome(home), "logs", "00-security");
}

/** Current UTC date as `YYYY-MM-DD`. */
export function todayUtc(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Current UTC instant as `YYYY-MM-DDTHH:MM:SSZ` (seconds, no millis). */
export function isoUtc(now: number = Date.now()): string {
  return new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Today's security-state file path. */
export function securityStatePath(now: number = Date.now(), home: string = homedir()): string {
  return join(securityStateDir(home), `${todayUtc(now)}-state.json`);
}

/** Load today's security state, or `{}` when missing/corrupt. */
export function loadSecurityState(now: number = Date.now(), home: string = homedir()): Record<string, unknown> {
  const path = securityStatePath(now, home);
  try {
    if (!existsSync(path)) return {};
    const data: unknown = JSON.parse(readFileSync(path, "utf-8"));
    return typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Persist today's security state (indent 2, no trailing newline). */
export function saveSecurityState(state: Record<string, unknown>, now: number = Date.now(), home: string = homedir()): void {
  mkdirSync(securityStateDir(home), { recursive: true });
  writeFileSync(securityStatePath(now, home), JSON.stringify(state, null, 2), "utf-8");
}
