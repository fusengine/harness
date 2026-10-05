/**
 * Compile the triggered-lesson index from `MEMORY/LESSON.md`. A lesson is a
 * bullet (`- [YYYY-MM-DD HH:MM] ...`); it opts into decision-time injection by
 * a `[TRIGGERS tool:.. path:.. error:.. keyword:..]` tag, either on its own
 * continuation line or inline at the very end of the bullet's text. Lessons
 * WITHOUT that tag are skipped here (they keep the SessionStart block behavior —
 * zero regression). Parsed once per file version (mtime-memoized).
 */
import { readFileSync, statSync } from "node:fs";
import { blockText, parse } from "../../runtime/lifecycle/aipilot/lesson-parse";
import { splitInlineTag } from "./trigger-tag";
import type { LessonEntry, Triggers } from "./types";

/** Matches a trailing `[TRIGGERS ...]` line (its body captured). */
const TRIGGER_RE = /^\[TRIGGERS\s+(.+?)\]$/;

/** Comma list for `key:` in a trigger body (values are space-delimited). */
function list(body: string, key: string): string[] {
  const m = body.match(new RegExp(`\\b${key}:([^\\s\\]]+)`));
  const val = m?.[1];
  return val ? val.split(",").filter(Boolean) : [];
}

/**
 * Comma list for `keyword:` — values MAY contain spaces: a value ends at the
 * next `,`, at the next ` <key>:` token, or at the end of the body.
 */
function keywordList(body: string): string[] {
  const m = body.match(/\bkeyword:(.*?)(?=\s(?:tool|path|error|keyword):|$)/);
  return (m?.[1] ?? "").split(",").map((v) => v.trim()).filter(Boolean);
}

/**
 * Parse a `[TRIGGERS ...]` body into predicates (error is a single regex).
 * Own-line tags keep their historical space-delimited keyword values (zero
 * regression); only inline tags take keyword values that contain spaces.
 */
function parseTriggers(body: string, inline: boolean): Triggers {
  const err = body.match(/\berror:([^\s\]]+)/);
  const keywords = inline ? keywordList(body) : list(body, "keyword");
  return { tools: list(body, "tool"), paths: list(body, "path"), error: err?.[1], keywords };
}

/** Collapse to a single ≤3-line compact string (cap length). */
function compact(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > 280 ? `${one.slice(0, 277)}…` : one;
}

/**
 * Parse LESSON.md content into triggered entries. A bullet's text spans its
 * `- ` line plus any following non-blank continuation lines up to the next
 * bullet; a `[TRIGGERS ...]` continuation line arms it (unchanged path). A
 * trailing INLINE tag arms the bullet too, but on lesson-parse's blocks (the
 * same bullet boundaries as archive/dedup/injection), only for a block with no
 * own-line tag that the own-line path has not already armed.
 * @param content - Raw LESSON.md text.
 * @returns Entries that declared triggers (others skipped), in file order.
 */
export function parseLessons(content: string): LessonEntry[] {
  const lines = content.split("\n");
  const found: { at: number; entry: LessonEntry }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || !line.startsWith("- ")) continue;
    let text = line.slice(2);
    let triggers: Triggers | null = null;
    for (let j = i + 1; j < lines.length; j++) {
      const cont = lines[j];
      if (cont === undefined || cont.trim() === "" || cont.startsWith("- ")) break;
      const body = cont.trim().match(TRIGGER_RE)?.[1];
      if (body !== undefined) triggers = parseTriggers(body, false);
      else text += ` ${cont.trim()}`;
    }
    if (triggers) found.push({ at: i, entry: { text: compact(text), triggers } });
  }
  const armed = new Set(found.map((f) => f.at));
  for (const b of parse(content).blocks) {
    if (armed.has(b.start) || b.raw.some((l) => TRIGGER_RE.test(l.trim()))) continue;
    const inline = splitInlineTag(blockText(b));
    if (inline) found.push({ at: b.start, entry: { text: compact(inline.text.replace(/^-\s*/, "")), triggers: parseTriggers(inline.body, true) } });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.entry);
}

let memo: { key: string; entries: LessonEntry[] } | null = null;

/**
 * Compile (once per file version) the triggered-lesson index from `file`.
 * Memoized by path+mtime: re-parses only when LESSON.md changes.
 * @param file - Absolute path to MEMORY/LESSON.md.
 * @returns The compiled entries (missing/unreadable file → empty).
 */
export function lessonIndex(file: string): LessonEntry[] {
  let key: string;
  try {
    key = `${file}:${statSync(file).mtimeMs}`;
  } catch {
    return [];
  }
  if (memo?.key === key) return memo.entries;
  let entries: LessonEntry[] = [];
  try {
    entries = parseLessons(readFileSync(file, "utf-8"));
  } catch {
    entries = [];
  }
  memo = { key, entries };
  return entries;
}
