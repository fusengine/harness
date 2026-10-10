/** @module motion/diff-text Linear Cline replacement extraction. */

/** Extract complete SEARCH/REPLACE blocks, or preserve malformed input verbatim. */
export function replacementText(diff: string): string {
  const parts: string[] = [];
  let state = 0;
  let end = "";
  let start = 0;
  let offset = 0;
  for (const line of diff.split("\n")) {
    const text = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (state === 0) {
      if (text === "<<<<<<< SEARCH" || text === "------- SEARCH") {
        end = text[0] === "<" ? ">>>>>>>" : "+++++++";
        state = 1;
      } else if (text.trim()) return diff;
    } else if (state === 1 && text === "=======") {
      state = 2;
      start = offset + line.length + 1;
    } else if (state === 2 && /^(?:>>>>>>>|\+{7}) REPLACE[ \t]*$/.test(text)) {
      if (!text.startsWith(`${end} REPLACE`)) return diff;
      parts.push(diff.slice(start, offset));
      state = 0;
    }
    offset += line.length + 1;
  }
  return state === 0 && parts.length > 0 ? parts.join("\n") : diff;
}
