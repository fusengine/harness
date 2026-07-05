/**
 * Stage 2 — compress the LESSON.md SessionStart/SubagentStart block (the big
 * token win). The RECENT_FULL newest bullets pass verbatim; every older bullet
 * collapses to ONE line — its date plus the FIRST SENTENCE of the actionable
 * rule after the bullet's LAST "→" (the file's `narrative → rule` format), or of
 * the whole bullet when there is no arrow, hard-capped at RULE_CAP chars. The
 * FILE keeps full bullets (human source of truth); only this injected view is
 * compressed, so compression applies even under the cap.
 */
import { type Block, parse } from "./lesson-parse";

/**
 * Newest bullets kept verbatim. Rationale: the most recent lessons are the ones
 * still tied to live work and worth full narrative context. Real bullets run
 * 0.5–1.5 kB each, so 10 (not 15) verbatim clears the >70% shrink target on the
 * live file while still preserving the actively-relevant recent set whole.
 */
export const RECENT_FULL = 10;

/** Max chars of a distilled rule — keeps every compressed bullet to one line. */
export const RULE_CAP = 200;

/** The `[YYYY-MM-DD HH:MM]` (or date-only) stamp of a bullet, "" if absent. */
function stamp(block: Block): string {
  const m = (block.raw[0] ?? "").match(/\[(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?)\]/);
  return m?.[1] ?? "";
}

/** Bullet text: raw lines joined, leading "- ", date stamp & TRIGGERS lines stripped. */
function bodyText(block: Block): string {
  const kept = block.raw.filter((l) => !/^\s*\[TRIGGERS\s/.test(l));
  return kept.join(" ").replace(/^-\s*/, "").replace(/\[\d{4}-\d{2}-\d{2}[^\]]*\]\s*/, "").trim();
}

/** First sentence of `s` (split on a period + whitespace), whole string if none. */
function firstSentence(s: string): string {
  return (s.split(/(?<=\.)\s/)[0] ?? s).trim();
}

/** Collapse one older bullet to `- [date] <rule>`: first sentence after last "→", capped. */
function compressBullet(block: Block): string {
  const text = bodyText(block);
  const arrow = text.lastIndexOf("→");
  let rule = firstSentence((arrow >= 0 ? text.slice(arrow + 1) : text).trim());
  if (rule.length > RULE_CAP) rule = `${rule.slice(0, RULE_CAP - 1).trimEnd()}…`;
  const date = stamp(block);
  return `- ${date ? `[${date}] ` : ""}${rule}`;
}

/**
 * Build the compressed injection body for `content`. The preamble comments are
 * dropped (format docs, noise for the reader); the `recentFull` newest bullets
 * stay whole, every older bullet becomes one distilled rule-line.
 * @param content - Raw LESSON.md text.
 * @param recentFull - Count of newest bullets to keep verbatim.
 * @returns The compressed block (bullets only), or the trimmed content when there are no bullets.
 */
export function compressInjection(content: string, recentFull: number = RECENT_FULL): string {
  const { blocks } = parse(content);
  if (blocks.length === 0) return content.trim();
  const full = blocks.slice(0, recentFull).map((b) => b.raw.join("\n"));
  const rest = blocks.slice(recentFull).map(compressBullet);
  return [...full, ...rest].join("\n");
}
