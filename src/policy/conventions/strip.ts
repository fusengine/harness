/**
 * Lexical comment/string masking for convention detectors. Every convention
 * rule (interfaces, types, hooks, stores, query) matches against MASKED
 * content so a declaration-looking line inside a comment, string, template
 * literal, or heredoc can never trigger a verdict. Masking replaces the
 * covered CHARACTERS with spaces but keeps every newline: line offsets and
 * `^…/m` anchors stay valid, and the output has the same line count.
 * Not a parser — a per-family state machine (c-like, python, ruby, php).
 */

/** Lexical profile of a language family. */
export type LexProfile = "c" | "py" | "rb" | "php";

/** Mask PHP heredoc/nowdoc blocks (`<<<TAG` … terminator line), offsets kept. */
function maskHeredocs(content: string): string {
  return content.replace(/<<<['"]?(\w+)['"]?\r?\n[\s\S]*?^\1;?$/gm, (block) => block.replace(/[^\n]/g, " "));
}

/**
 * Mask comments and strings of `content` according to its lexical profile.
 * @param content - Source text.
 * @param profile - Lexical family (see `langs.ts` `lexProfileOf`).
 * @returns Same-length text with comment/string interiors blanked.
 */
export function maskCommentsAndStrings(content: string, profile: LexProfile): string {
  return maskScan(content, profile, false);
}

/**
 * Mask COMMENTS only (strings kept) — for detectors whose signal IS a string
 * literal (module imports like `from "zustand"`): a `// import …` comment
 * cannot match, while the real import line stays readable.
 * @param content - Source text.
 * @param profile - Lexical family.
 * @returns Same-length text with comment interiors blanked.
 */
export function maskCommentsOnly(content: string, profile: LexProfile): string {
  return maskScan(content, profile, true);
}

/** Shared scanner; `keepStrings` skips the string-masking branch. */
function maskScan(content: string, profile: LexProfile, keepStrings: boolean): string {
  if (profile === "php") content = maskHeredocs(content);
  const out = content.split("");
  const blank = (i: number) => { if (out[i] !== "\n") out[i] = " "; };
  const isPy = profile === "py" || profile === "rb";
  let i = 0;
  while (i < out.length) {
    const two = content.slice(i, i + 2);
    if (!isPy && two === "//") { while (i < out.length && out[i] !== "\n") blank(i++); continue; }
    if (isPy && out[i] === "#") { while (i < out.length && out[i] !== "\n") blank(i++); continue; }
    if (profile === "php" && out[i] === "#") { while (i < out.length && out[i] !== "\n") blank(i++); continue; }
    if (!isPy && two === "/*") { const end = content.indexOf("*/", i + 2); const stop = end === -1 ? out.length : end + 2; while (i < stop) blank(i++); continue; }
    if (isPy && (content.startsWith("'''", i) || content.startsWith('"""', i))) {
      const q = content.slice(i, i + 3);
      const end = content.indexOf(q, i + 3);
      const stop = end === -1 ? out.length : end + 3;
      while (i < stop) blank(i++);
      continue;
    }
    if (!keepStrings && (out[i] === "'" || out[i] === '"' || (profile === "c" && out[i] === "`"))) {
      const q = out[i] as string;
      // Unterminated-quote guard: a single/double quote never opens a string
      // past its own line (JS/TS has no multiline plain strings — a JSX
      // apostrophe like `Don't` must not swallow the rest of the file), and
      // an unterminated template literal masks nothing (unpaired backtick).
      let j = i + 1, closed = -1;
      while (j < out.length && out[j] !== "\n") {
        if (out[j] === "\\") { j += 2; continue; }
        if (out[j] === q) { closed = j; break; }
        j++;
      }
      if (q === "`") {
        if (closed !== -1) { while (i <= closed) blank(i++); continue; }
        const end = content.indexOf("`", i + 1);
        if (end !== -1) { while (i <= end) blank(i++); continue; }
        i++;
        continue;
      }
      if (closed === -1) { i++; continue; }
      while (i <= closed) blank(i++);
      continue;
    }
    i++;
  }
  return out.join("");
}
