/**
 * Security advisory (PreToolUse Write/Edit on code files) — NON-BLOCKING.
 * Ports `check-security-skill.py`: nudge the agent to read the security skill,
 * but always allow the edit.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { securityStatePath } from "./skill-state";
import { contextResponse } from "../../../adapters/claude";
import type { NormalizedFile } from "../../normalize";

const CODE_RE = /\.(ts|tsx|js|jsx|py|php|swift|go|rs|rb|java)$/;
const ADVISORY = "SECURITY: Read security skill references before modifying code. Use: Read skills/security-scan/references/scan-patterns.md";

/** True once today's security skill is marked read. Fail-open: missing/corrupt state reads as unread. */
function skillAlreadyRead(now: number, home: string): boolean {
  const path = securityStatePath(now, home);
  if (!existsSync(path)) return false;
  try {
    const state = JSON.parse(readFileSync(path, "utf-8")) as { skill_read?: boolean };
    return state.skill_read === true;
  } catch {
    return false;
  }
}

/**
 * Build a non-blocking PreToolUse advisory when editing a code file before the
 * security skill has been read, "" otherwise. Renders through the shared
 * {@link contextResponse} builder (`additionalContext` only) — NEVER a naked
 * `permissionDecision: "allow"`, which the Codex adapter's own hook shape
 * (`src/adapters/claude/index.ts`) never emits and which Codex rejects.
 * @param tool - The tool name (`Write`/`Edit`).
 * @param filePath - The target file path.
 * @param now - Clock.
 * @param home - Home dir.
 * @returns The advisory response JSON, or "".
 */
export function securityAdvisory(tool: string, filePath: string, now: number = Date.now(), home: string = homedir()): string {
  if (tool !== "Write" && tool !== "Edit") return "";
  if (!CODE_RE.test(filePath)) return "";
  if (skillAlreadyRead(now, home)) return "";
  return contextResponse("PreToolUse", ADVISORY);
}

/**
 * Multi-file counterpart for a Codex `apply_patch` envelope: evaluate EACH
 * add/update file (delete ignored outright; non-code filtered by the same
 * `CODE_RE` inside {@link securityAdvisory}) and return the advisory
 * triggered by the FIRST qualifying file, or "" once the skill has been read
 * or no file qualifies.
 * @param files - The patch's per-file changes ({@link NormalizedFile}).
 * @param now - Clock.
 * @param home - Home dir.
 */
export function securityAdvisoryForPatch(files: readonly NormalizedFile[], now: number = Date.now(), home: string = homedir()): string {
  for (const f of files) {
    if (f.op === "delete") continue;
    const advisory = securityAdvisory(f.op === "add" ? "Write" : "Edit", f.filePath, now, home);
    if (advisory) return advisory;
  }
  return "";
}
