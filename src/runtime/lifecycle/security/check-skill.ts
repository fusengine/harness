/**
 * Security advisory (PreToolUse Write/Edit on code files) — NON-BLOCKING.
 * Ports `check-security-skill.py`: nudge the agent to read the security skill,
 * but always allow the edit.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { securityStatePath } from "./skill-state";

const CODE_RE = /\.(ts|tsx|js|jsx|py|php|swift|go|rs|rb|java)$/;
const ADVISORY = "SECURITY: Read security skill references before modifying code. Use: Read skills/security-scan/references/scan-patterns.md";

/**
 * Build a non-blocking PreToolUse `allow` response with a security advisory when
 * editing a code file before the security skill has been read. "" otherwise.
 * @param tool - The tool name (`Write`/`Edit`).
 * @param filePath - The target file path.
 * @param now - Clock.
 * @param home - Home dir.
 * @returns The advisory response JSON, or "".
 */
export function securityAdvisory(tool: string, filePath: string, now: number = Date.now(), home: string = homedir()): string {
  if (tool !== "Write" && tool !== "Edit") return "";
  if (!CODE_RE.test(filePath)) return "";
  const path = securityStatePath(now, home);
  if (existsSync(path)) {
    try {
      const state = JSON.parse(readFileSync(path, "utf-8")) as { skill_read?: boolean };
      if (state.skill_read === true) return "";
    } catch { /* fall through to advisory */ }
  }
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", additionalContext: ADVISORY },
  });
}
