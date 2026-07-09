import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { resolveMaxLines } from "../config/limits";
import { DEV_KEYWORDS, type ProjectType } from "./detect-project";
import { getExpertAgent } from "./expert-agents";

/** Dev-verb regex (FR/EN) that triggers the APEX preamble (case-insensitive). */
export const DEV_VERBS: RegExp =
  /(cr[ée]er|impl[ée]menter|ajouter|d[ée]velopper|construire|build|refactor|migrer|implement|create|add|develop)/i;

/**
 * Detect the project type from the cwd, reproducing the legacy Python logic:
 * package.json containing "next" → nextjs, else "react" → react; else
 * composer.json+artisan → laravel; else Package.swift / *.xcodeproj → swift;
 * else generic.
 * @param cwd - Project root to scan.
 * @returns The detected project type label.
 */
export function detectClaudeMdProjectType(cwd: string): ProjectType {
  const pkg = join(cwd, "package.json");
  if (existsSync(pkg)) {
    try {
      const content = readFileSync(pkg, "utf-8");
      if (content.includes("next")) return "nextjs";
      if (content.includes("react")) return "react";
    } catch {
      /* unreadable package.json → fall through */
    }
  }
  if (existsSync(join(cwd, "composer.json")) && existsSync(join(cwd, "artisan"))) return "laravel";
  if (existsSync(join(cwd, "Package.swift"))) return "swift";
  try {
    if (readdirSync(cwd).some((f) => f.endsWith(".xcodeproj"))) return "swift";
  } catch {
    /* unreadable dir → ignore */
  }
  return "generic";
}

/**
 * Build the APEX instruction preamble for a development task.
 * @param projectType - Detected project type label.
 * @param maxLines - SOLID per-file line ceiling.
 * @returns The APEX instruction text.
 */
export function buildApexInstruction(projectType: ProjectType, maxLines: number): string {
  const expertAgent = getExpertAgent(projectType);
  return (
    `INSTRUCTION: This is a development task. Use APEX methodology:\n\n` +
    `**TRACKING FILE**: [project]/.claude/apex/task.json — create it yourself via apex-methodology Step 0 (init-tracking) if missing\n\n` +
    `1. **ANALYZE** (MANDATORY - 3 AGENTS IN PARALLEL):\n` +
    `   - explore-codebase + research-expert + ${expertAgent} (framework expertise)\n` +
    `   - Project type detected: ${projectType}\n\n` +
    `2. **PLAN**: Use TaskCreate to break down tasks (<${maxLines} lines per file)\n\n` +
    `3. **EXECUTE**: ${expertAgent}, follow SOLID principles, split at ${maxLines - 10} lines\n\n` +
    `4. **eLICIT**: self-review with NAMED elicitation techniques (apex ref 03.5-elicit) — fix findings BEFORE validation\n\n` +
    `5. **VERIFY**: functional check — run it, confirm references⇔declarations consistency\n\n` +
    `6. **eXAMINE**: Run sniper agent after ANY modification\n\n` +
    `**GATE**: eLicit + Verify BEFORE sniper — NEVER skip.\n\n` +
    `**IMPORTANT**: Read .claude/apex/task.json to check documentation status before writing code.`
  );
}

/**
 * Build the UserPromptSubmit injection text: read `~/.claude/CLAUDE.md` and,
 * when the prompt matches a dev verb, prepend the APEX instruction. Returns
 * `null` when CLAUDE.md is absent/unreadable (the hook then emits nothing).
 * @param prompt - The raw user prompt.
 * @param cwd - Project root (for project-type detection).
 * @returns The injection text, or `null` to emit nothing.
 */
export function buildClaudeMdContext(prompt: string, cwd: string): string | null {
  const claudeMd = join(homedir(), ".claude", "CLAUDE.md");
  if (!existsSync(claudeMd)) return null;
  let claudeContent: string;
  try {
    claudeContent = readFileSync(claudeMd, "utf-8");
  } catch {
    return null;
  }
  if (!DEV_VERBS.test(prompt) && !DEV_KEYWORDS.test(prompt)) return `# CLAUDE.md\n${claudeContent}`;
  const apex = buildApexInstruction(detectClaudeMdProjectType(cwd), resolveMaxLines());
  return `${apex}\n\n# CLAUDE.md\n${claudeContent}`;
}
