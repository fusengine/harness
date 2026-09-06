/**
 * Collapses separators the write guard's command-position anchors don't
 * need at full width down to a minimal one, for {@link anchorText}
 * (bash-write-lexer.ts). Split into its own file to keep
 * bash-write-lexer-heredoc.ts under the SOLID ceiling — no heredoc-specific
 * coupling.
 */

/**
 * Collapses separators in a single linear pass (no regex): every run of 2+
 * consecutive newlines (with only spaces/tabs between them) becomes ONE
 * `\n`, and every run of 2+ consecutive spaces/tabs becomes ONE space. A
 * regex-based equivalent backtracks quadratically on a long blank-line run
 * (`CMD`'s `(?:^|[\n;&|(\`])\s*` prefix, bash-command-anchor.ts) — this
 * manual pass stays linear regardless of input shape.
 * @param text - Already lexed anchor text.
 * @returns `text` with blank-line/whitespace runs collapsed.
 */
export function collapseSeparators(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === "\n") {
      out += "\n";
      i += 1;
      let j = i;
      let sawNewline = false;
      while (j < n) {
        if (text[j] === "\n") { sawNewline = true; j += 1; continue; }
        if (text[j] === " " || text[j] === "\t") { j += 1; continue; }
        break;
      }
      if (sawNewline) i = j;
      continue;
    }
    if (ch === " " || ch === "\t") {
      out += " ";
      i += 1;
      while (i < n && (text[i] === " " || text[i] === "\t")) i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}
