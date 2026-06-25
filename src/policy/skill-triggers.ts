/**
 * Content → sub-skill consultation gate, ported from the fusengine Python
 * `*_skill_triggers.py` (react/nextjs/laravel) + `check_skill_common.py`
 * `specific_skill_consulted`. Maps written-code API patterns to a required
 * sub-skill and blocks when its `skills/<name>/` path was not read in-session.
 */
import type { Prompt } from "../prompt/types";
import { CASE_SENSITIVE_FRAMEWORKS, SKILL_TRIGGERS } from "./skill-trigger-patterns";
import { isShadcnProject } from "./shadcn-project";

export { SKILL_TRIGGERS } from "./skill-trigger-patterns";

/**
 * Detect which sub-skills the written `content` requires for a `framework`.
 * Faithful to the Python `detect_required_skills`: first matching pattern per
 * skill wins. Most frameworks match case-insensitively (source `re.IGNORECASE`);
 * `swift` matches case-sensitively (see {@link CASE_SENSITIVE_FRAMEWORKS}).
 * @param framework - "react" | "nextjs" | "laravel" | "swift".
 * @param content - the code being written.
 * @returns required sub-skill names (empty when framework unknown / no match).
 */
export function detectRequiredSkills(framework: string, content: string): string[] {
  const groups = SKILL_TRIGGERS[framework];
  if (!groups) return [];
  const flags = CASE_SENSITIVE_FRAMEWORKS.has(framework) ? "" : "i";
  const required: string[] = [];
  for (const [skill, patterns] of Object.entries(groups)) {
    if (patterns.some((p) => new RegExp(p, flags).test(content))) required.push(skill);
  }
  return required;
}

/**
 * Block when a required sub-skill's `skills/<name>/` path is absent from
 * `refsRead`. Mirrors `specific_skill_consulted`, which confirms a skill was
 * read by checking the tracking file contains `skills/<name>/`.
 * @param framework - "react" | "nextjs" | "laravel".
 * @param content - the code being written.
 * @param refsRead - in-session read reference paths.
 * @param forcedSkill - a skill the detected modular architecture forces (optional).
 * @param cwd - project root; when set and not a shadcn project, `*-shadcn`
 *   requirements are skipped (ports the Python `is_shadcn_project` filter).
 * @returns a `block` Prompt naming the missing sub-skills, or `null` when satisfied.
 */
export function skillTriggerGate(
  framework: string,
  content: string,
  refsRead: string[],
  forcedSkill?: string | null,
  cwd?: string,
): Prompt | null {
  let required = detectRequiredSkills(framework, content);
  if (forcedSkill && !required.includes(forcedSkill)) required.push(forcedSkill);
  if (cwd && !isShadcnProject(cwd)) required = required.filter((s) => !s.endsWith("-shadcn"));
  const missing = required.filter(
    (s) => !refsRead.some((r) => r.includes(`skills/${s}/`)),
  );
  if (missing.length === 0) return null;
  return {
    kind: "block",
    title: "Required sub-skill not consulted",
    reason:
      `${framework}: code uses APIs covered by ${missing.join(", ")} ` +
      "but its skill reference was not read this session.",
    actions: missing.map((s) => `Read skills/${s}/ before writing this code`),
  };
}
