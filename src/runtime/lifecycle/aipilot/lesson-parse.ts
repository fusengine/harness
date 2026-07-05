/**
 * Shared, LLM-free primitives for LESSON.md curation: bullet parsing, timestamp
 * extraction, tokenization/Jaccard (dedup), cited-path detection, and the
 * cap/stale constants. Consumed by curate-lessons (dedup), lesson-archive
 * (cap→archive) and lesson-inject (compressed SessionStart block) — one source
 * of truth so the three stages can never disagree on what a "bullet" is.
 */

/** Bullet count above which the oldest lessons are archived out of LESSON.md. */
export const CAP = 50;
/** Age (days) past which a lesson is eligible for archival / stale-flagging. */
export const STALE_DAYS = 90;
/** Milliseconds in a day. */
export const DAY_MS = 86400000;
/** Case-sensitive decision-time tag line (`[TRIGGERS …]`) — opus-lessons format. */
export const TRIG: RegExp = /^\[TRIGGERS\s+.+\]$/;

/** A bullet plus any continuation lines (e.g. a `[TRIGGERS …]` line). */
export interface Block { raw: string[]; ts: number; tokens: Set<string>; }

/** Epoch ms for a `[YYYY-MM-DD HH:MM]` stamp; `NaN` if absent or out of range. */
export function parseTs(line: string): number {
  const m = line.match(/\[(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return NaN;
  const mo = +(m[2] ?? 0), d = +(m[3] ?? 0);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
  return Date.UTC(+(m[1] ?? 0), mo - 1, d, +(m[4] ?? 0), +(m[5] ?? 0));
}

/** Content words (>=4 chars), timestamp & TRIGGERS marker stripped. */
export function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/\[triggers[^\]]*\]/g, " ")
      .replace(/\[\d{4}-\d{2}-\d{2}[^\]]*\]/g, " ")
      .replace(/[^a-z0-9àâäéèêëîïôöùûüç/._-]+/gi, " ")
      .split(/\s+/).filter((t) => t.length >= 4),
  );
}

/** Jaccard overlap of two token sets (0 when both empty). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const inter = [...a].filter((t) => b.has(t)).length;
  return inter / (a.size + b.size - inter);
}

/** Repo-relative cited paths (slash + extension) referenced in a block. */
export function citedPaths(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/`([^`]+)`/g)) { if (m[1]) out.add(m[1]); }
  for (const m of text.matchAll(/[\w./@-]+\.\w{1,5}/g)) { if (m[0]) out.add(m[0]); }
  return [...out].filter((p) => p.includes("/") && /\.\w{1,5}$/.test(p));
}

/** True when a block carries a `[TRIGGERS …]` continuation line. */
export function hasTrigger(b: Block): boolean {
  return b.raw.some((l) => TRIG.test(l.trim()));
}

/** Split content into a verbatim preamble and one Block per `- ` bullet. */
export function parse(content: string): { preamble: string; blocks: Block[] } {
  const lines = content.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length && !/^-\s/.test(lines[i] ?? "")) i++;
  const preamble = lines.slice(0, i).join("\n");
  for (; i < lines.length; i++) {
    const l = lines[i] ?? "", last = blocks[blocks.length - 1];
    if (/^-\s/.test(l)) blocks.push({ raw: [l], ts: parseTs(l), tokens: tokenize(l) });
    else if (l.trim() && last) last.raw.push(l);
  }
  return { preamble, blocks };
}
