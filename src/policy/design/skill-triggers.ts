/**
 * @module design/skill-triggers
 * Domain-specific design-skill detection: maps written code patterns to the
 * precise design SKILL.md that must have been consulted. Ports the Python
 * `design_skill_triggers.py` `SKILL_TRIGGERS` table + `detect_required_skills`.
 * @packageDocumentation
 */

/** A domain skill + the code patterns that require it + its `refsRead` path fragment. */
export interface SkillTrigger {
  /** Skill id for the block message, e.g. "4-adding-animations". */
  skill: string;
  /** Path fragment proving the skill was read (matched against `refsRead`). */
  readFragment: string;
  /** Code patterns that trigger the requirement (case-insensitive). */
  patterns: readonly RegExp[];
}

/** Domain skill triggers (ported 1:1 from `design_skill_triggers.py`). */
export const SKILL_TRIGGERS: readonly SkillTrigger[] = [
  { skill: "3-generating-components", readFragment: "generating-components", patterns: [
    /className\s*=\s*["{]/i, /<(div|section|main|header|footer|nav|aside)\s/i,
    /flex|grid|gap-|p-|m-|bg-|text-|rounded|shadow|border/i,
    /(Button|Card|Dialog|Sheet|Input|Select|Table)\b/i,
    /cva|class-variance-authority|variants\b/i, /VariantProps|variant.*:\s*\{/i,
    /children|slots|asChild|Slot|render.?prop/i, /forwardRef|React\.cloneElement|compound/i,
  ] },
  { skill: "1-designing-systems", readFragment: "designing-systems", patterns: [
    /--(\w+-)+color:|:root\s*\{|@theme\b/i, /design.?system|token|palette|typography.?scale/i,
    /--(\w+)-(foreground|background|primary|muted|accent):/i, /cssVariables|themeConfig|colorScheme/i,
    /dark:|prefers-color-scheme|next-themes|useTheme/i, /ThemeProvider|data-theme|color-scheme/i,
    /sm:|md:|lg:|xl:|2xl:/i, /@container|container-type|@media/i, /clamp\(|fluid|min-width:/i,
  ] },
  { skill: "4-adding-animations", readFragment: "adding-animations", patterns: [
    /motion\.|framer-motion|animate|variants/i, /whileHover|whileTap|AnimatePresence|transition/i,
    /@keyframes\b|animation:\s/i, /backdrop-blur|bg-.*\/([\d]+)|glass/i, /backdrop-filter:\s*blur/i,
    /hover:|focus:|active:|disabled:|focus-visible:/i, /data-\[state=|data-\[disabled\]/i,
    /bg-gradient|from-|via-|to-/i, /radial-gradient|conic-gradient|bg-\[url/i, /blur-.*xl|opacity-|mix-blend/i,
  ] },
  { skill: "5-design-audit", readFragment: "design-audit", patterns: [
    /aria-|role=|sr-only|tabIndex|alt=/i, /WCAG|a11y|contrast|screen.?reader/i,
  ] },
];

/** Return the domain skills required by `content` but NOT present in `refsRead`. */
export function missingDomainSkills(content: string, refsRead: readonly string[]): string[] {
  return SKILL_TRIGGERS
    .filter((t) => t.patterns.some((re) => re.test(content)))
    .filter((t) => !refsRead.some((p) => p.includes(t.readFragment)))
    .map((t) => t.skill);
}
