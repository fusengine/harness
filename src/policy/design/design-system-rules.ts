/**
 * Content rules for design-system.md — the four hard requirements the
 * pipeline validates on the nominal write path (and the opt-in Gemini one).
 * Split out of `gates.ts` to keep both files within the SOLID size budget.
 */
import { hasCorpusCitation } from "./corpus";

const OKLCH_RE = /oklch\(\s*[\d.]+%?\s+0\.0*[1-9]/;

/**
 * Forbidden fonts, matched in USAGE contexts — never in free prose: a design
 * system may SAY "Inter" ("## Interaction states", "we never use Inter"), it
 * may not USE it as a font. Covered forms: CSS declarations (`font:`,
 * `font-family:` in any case, multiline values), JS config (`fontFamily:`),
 * custom properties named in English (`--*font*`/`--*ff*`/`--*type*`, value
 * unquoted or quoted), ANY custom property whose value quotes a forbidden
 * name (`--police-texte: "Inter", …` — a non-English property name has no
 * keyword to key off, so the quote itself is the usage signal: a quoted
 * token in a `--*` value is a font-family entry, not prose), `@import`
 * URLs, and Markdown table cells (`| Body | Inter |`). Explicitly OUT of
 * scope (chosen, not overlooked): unquoted prose in bullet lines —
 * distinguishing "usage" from "mention" there is prose parsing, not a
 * regex's job. Accepted trade-off of the quote signal: `--comment: "we
 * never use Inter"` is flagged too — a quoted mention reads identically to
 * a quoted usage once the property name carries no keyword to disambiguate.
 */
const FONT_DECL_RE = /(?:font(?:-family)?|fontFamily|--[\w-]*(?:font|ff|type)[\w-]*)\s*:[^;\n]*(?:\n\s*)?[^;\n]*\b(?:Inter|Roboto|Arial|Open Sans)\b/i;
const FONT_IMPORT_RE = /family=[^&"')]*\b(?:Inter|Roboto|Arial|Open Sans)\b/i;
const FONT_TABLE_RE = /\|\s*\*{0,2}(?:Inter|Roboto|Arial|Open Sans)\*{0,2}\s*\|/;
const FONT_QUOTED_PROP_RE = /--[\w-]+\s*:[^;\n]*["'][^;\n]*(?:\n\s*)?[^;\n]*\b(?:Inter|Roboto|Arial|Open Sans)\b/i;

/**
 * Return the requirements missing from a design-system.md (empty = valid).
 * The corpus citation satisfies the source requirement ONLY when the corpus
 * is actually delivered (`corpusCitationOk`) — absent corpus, the URL is
 * mandatory again, exactly the pre-doctrine behavior (fallback never weaker).
 */
export function validateDesignSystem(content: string, corpusCitationOk = false): string[] {
  const missing: string[] = [];
  if (!content.includes("## Design Reference")) missing.push("## Design Reference section");
  if (!/https?:\/\//.test(content) && !(corpusCitationOk && hasCorpusCitation(content))) missing.push("reference URL (https://…) or Corpus citation");
  if (!OKLCH_RE.test(content)) missing.push("oklch() color with chroma > 0");
  if (FONT_DECL_RE.test(content) || FONT_IMPORT_RE.test(content) || FONT_TABLE_RE.test(content) || FONT_QUOTED_PROP_RE.test(content)) missing.push("forbidden font (Inter/Roboto/Arial/Open Sans)");
  return missing;
}
