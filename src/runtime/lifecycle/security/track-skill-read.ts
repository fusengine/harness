/**
 * Security skill-read tracker (PostToolUse Read). Ports `track-skill-read.py`:
 * flips `skill_read` once a security skill reference is read.
 */
import { homedir } from "node:os";
import { isoUtc, loadSecurityState, saveSecurityState } from "./skill-state";

const SKILL_RE = /skills\/(security-scan|cve-research|dependency-audit|security-headers|auth-audit)\//;

/** A recorded skill-reference read. */
interface SkillReadEntry {
  timestamp: string;
  file: string;
}

/**
 * Mark the security skill as read when a Read hits a security skill reference.
 * No-op for other tools/paths. No stdout.
 * @param tool - The tool name.
 * @param filePath - The read file path.
 * @param now - Clock.
 * @param home - Home dir.
 */
export function trackSkillRead(tool: string, filePath: string, now: number = Date.now(), home: string = homedir()): void {
  if (tool !== "Read") return;
  if (!SKILL_RE.test(filePath)) return;
  const state = loadSecurityState(now, home) as { skill_read?: boolean; reads?: SkillReadEntry[] };
  state.skill_read = true;
  (state.reads ??= []).push({ timestamp: isoUtc(now), file: filePath });
  saveSecurityState(state, now, home);
}
