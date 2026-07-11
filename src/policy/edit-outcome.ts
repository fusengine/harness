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
