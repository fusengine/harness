import { countLines } from "./file-size";

/**
 * Count non-overlapping literal occurrences of `needle` in `haystack`. An
 * empty `needle` returns 0 — treated as "not found" by callers, since Edit's
 * `old_string` is never legitimately empty and an empty needle has no
 * well-defined occurrence count.
 * @param haystack - The on-disk file content to search.
 * @param needle - The literal substring to count.
 */
function countOccurrences(haystack: string, needle: string): number {
  if (needle === "") return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    count++;
    from = at + needle.length;
  }
  return count;
}

/**
 * Compute the line count an Edit would PRODUCE, before it lands on disk —
 * `existingLines − countLines(old_string) + countLines(new_string)`, scaled
 * by how many `old_string` occurrences are actually replaced (1 normally, or
 * every occurrence under `replace_all`). Pure arithmetic on the literal
 * strings — no regex/fuzzy matching, matching the real Edit tool's own
 * exact-substring semantics.
 *
 * Returns `null` (fail-closed — caller must fall back to judging the stale
 * on-disk count alone) when `old_string` is missing/empty, or does not occur
 * in `existingContent` at all: an Edit whose `old_string` doesn't match the
 * real file is stale or adversarial, never a case to special-case an allow for.
 * @param existingContent - Full on-disk content of the file being edited.
 * @param oldString - The Edit's `old_string` (tool_input, unmodified).
 * @param newString - The Edit's `new_string` (tool_input, unmodified).
 * @param replaceAll - The Edit's `replace_all` flag.
 */
export function computeEditResultLines(
  existingContent: string,
  oldString: string | undefined,
  newString: string,
  replaceAll: boolean,
): number | null {
  if (!oldString) return null;
  const occurrences = countOccurrences(existingContent, oldString);
  if (occurrences === 0) return null;
  const times = replaceAll ? occurrences : 1;
  const delta = countLines(newString) - countLines(oldString);
  return countLines(existingContent) + delta * times;
}

/** One `@@` chunk of a Codex `apply_patch` Update File: old/new sides, `\n`-joined (adapters/codex/apply-patch.ts). */
export interface PatchHunkDelta {
  /** Old side (context + removed lines). Empty = pure-add chunk, appended at end of file like Codex does. */
  oldString: string;
  /** New side (context + added lines). */
  newString: string;
  /** True for a pure deletion (no new-side lines at all) — the only case where the line terminator goes too; a single blank new line also joins to `""` but adds a line. */
  deletion?: true;
}

/**
 * Find `needle` in `haystack` at a LINE boundary (start of text or after
 * `\n`, and end of text or before `\n`) — the only kind of match Codex's own
 * line-based applier can make. Bounded by the haystack length.
 * @returns The start index, or -1.
 */
function indexOfLineAligned(haystack: string, needle: string): number {
  let from = 0;
  for (let guard = 0; guard <= haystack.length; guard++) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return -1;
    const end = at + needle.length;
    const startOk = at === 0 || haystack[at - 1] === "\n";
    const endOk = end === haystack.length || haystack[end] === "\n";
    if (startOk && endOk) return at;
    from = at + 1;
  }
  return -1;
}

/**
 * Compute the line count a Codex `apply_patch` Update File would PRODUCE by
 * APPLYING every `@@` chunk to the real on-disk text and counting the result
 * once — the same `countLines` semantics as the on-disk count, so a chunk's
 * trailing blank line, a bare `+`, or a file's final newline are all counted
 * exactly as the written file will be (per-chunk arithmetic gets the final
 * newline wrong by one).
 *
 * Fails closed to `null` (caller falls back to the on-disk count alone) when:
 * the chunk list is empty; a chunk's old side does not occur at a line
 * boundary in `existingContent`; two chunks overlap in the original file (a
 * real patch's chunks are disjoint, so overlap means the outcome cannot be
 * trusted); or a pure deletion's line-terminator drop (`dropAfter`/`dropBefore`)
 * would consume a `\n` that falls INSIDE another chunk's own range — two
 * back-to-back chunks can share that boundary character (e.g. one chunk's old
 * side ends on a blank line, the next chunk's old side starts on that same
 * blank line) without their `[start, end)` spans literally overlapping, which
 * would otherwise double-claim that line and silently miscount. A pure-add
 * chunk (empty old side) is appended at end of file, matching
 * `codex-rs/apply-patch`'s `old_lines.is_empty()` branch.
 * @param existingContent - Full on-disk content of the file being patched.
 * @param hunks - One chunk per `@@` block, in patch order.
 */
export function computePatchResultLines(existingContent: string, hunks: readonly PatchHunkDelta[]): number | null {
  if (hunks.length === 0) return null;
  const located: Array<{ start: number; end: number; text: string; del: boolean }> = [];
  const appends: string[] = [];
  for (const h of hunks) {
    if (h.oldString === "") {
      appends.push(h.newString);
      continue;
    }
    const start = indexOfLineAligned(existingContent, h.oldString);
    if (start === -1) return null;
    const end = start + h.oldString.length;
    if (located.some((r) => r.start < end && start < r.end)) return null;
    located.push({ start, end, text: h.newString, del: h.deletion === true });
  }
  // A pure deletion's line-terminator drop (`\n` after the range, or the one
  // before it when the range ends the file) must never reach into a SIBLING
  // chunk's own [start, end) — two back-to-back chunks can share that exact
  // boundary character (one chunk's old side ends on a blank line, the next
  // starts on that same blank line) without their spans literally overlapping.
  // Computed against the pristine `existingContent`, before any mutation.
  const claimedBySibling = (idx: number, self: (typeof located)[number]): boolean =>
    located.some((o) => o !== self && o.start <= idx && idx < o.end);
  for (const r of located) {
    if (!r.del) continue;
    if (existingContent[r.end] === "\n") {
      if (claimedBySibling(r.end, r)) return null;
    } else if (r.start > 0 && existingContent[r.start - 1] === "\n" && claimedBySibling(r.start - 1, r)) {
      return null;
    }
  }
  located.sort((a, b) => b.start - a.start);
  let out = existingContent;
  for (const r of located) {
    // A pure deletion removes whole LINES (Codex `lines.remove`), so the line
    // terminator goes with them: the `\n` after the range, or the one before
    // it when the range ends the file — otherwise a blank line would survive.
    const dropAfter = r.del && out[r.end] === "\n" ? 1 : 0;
    const dropBefore = r.del && dropAfter === 0 && r.start > 0 && out[r.start - 1] === "\n" ? 1 : 0;
    out = out.slice(0, r.start - dropBefore) + r.text + out.slice(r.end + dropAfter);
  }
  for (const a of appends) out = (out === "" || out.endsWith("\n") ? out : `${out}\n`) + `${a}\n`;
  return countLines(out);
}
