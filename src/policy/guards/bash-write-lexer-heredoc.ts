/**
 * Heredoc-operator parsing and body-skip helpers for {@link anchorText}
 * (bash-write-lexer.ts). Split into its own file to keep the main state
 * machine under the SOLID ceiling.
 *
 * Both exports operate on the RAW multi-line command string — never on a
 * pre-stripped view — because {@link anchorText} calls them from inside its
 * own single left-to-right pass, at the exact character position the
 * operator/body begins.
 */

/** Stops a BARE heredoc word (POSIX word-token rule, not `\w`): a delimiter
 *  may contain `-`/`.`/`/` etc — only a blank, newline, or shell metachar
 *  ends it. Includes `\n` since delimiter parsing runs over the full
 *  multi-line string, not a single line. */
const HEREDOC_WORD_STOP = /[ \t\n|&;()<>]/;

/**
 * Parses the delimiter WORD immediately after a heredoc operator's optional
 * spaces, applying POSIX quote removal (§2.6.7, as directed by §2.7.4)
 * character-by-character left to right: a `'…'`/`"…"` span contributes its
 * literal content, a `\X` escape contributes `X`, and any other character
 * is copied verbatim — quoted and unquoted segments simply CONCATENATE, so
 * a delimiter with embedded quotes (`E"O"F`, `E'O'F`, `"E"OF`) reduces to
 * `EOF` exactly like a fully-quoted (`'EOF'`) or backslash-escaped (`\EOF`)
 * one. Scanning stops at the first unquoted {@link HEREDOC_WORD_STOP}
 * character (not `\w+` — `END.marker`/`EOF-1` are legal POSIX delimiters).
 * Each quoted span's closing quote is bounded to the current line — a
 * delimiter never spans a newline; an unclosed quote aborts the WHOLE
 * delimiter (returns `null`, letting the caller treat `<<` as ordinary
 * text) rather than silently truncating it.
 * @returns The bare WORD (quotes/backslashes removed) and the index right
 *   after the token, or `null` if `at` is not a valid delimiter.
 */
function parseDelimiter(cmd: string, at: number): { word: string; end: number } | null {
  const n = cmd.length;
  let i = at;
  let word = "";
  let sawAny = false;
  while (i < n) {
    const ch = cmd[i];
    if (ch === "'" || ch === '"') {
      const lineEnd = cmd.indexOf("\n", i + 1);
      const bound = lineEnd < 0 ? n : lineEnd;
      const close = cmd.indexOf(ch, i + 1);
      if (close < 0 || close > bound) return null;
      word += cmd.slice(i + 1, close);
      i = close + 1;
      sawAny = true;
      continue;
    }
    if (ch === "\\" && i + 1 < n && cmd[i + 1] !== "\n") {
      word += cmd[i + 1];
      i += 2;
      sawAny = true;
      continue;
    }
    if (HEREDOC_WORD_STOP.test(ch ?? "")) break;
    word += ch;
    i += 1;
    sawAny = true;
  }
  return sawAny ? { word, end: i } : null;
}

/**
 * Recognizes a real heredoc operator (`<<`/`<<-`, never `<<<` — a
 * here-string) at `i` and parses its delimiter. An fd prefix (`2<<EOF`) is
 * allowed implicitly: the caller only ever calls this when `cmd[i]` is `<`,
 * regardless of what precedes it.
 * @param cmd - Raw shell command string.
 * @param i - Index of the candidate `<` character.
 * @returns The end index of the FULL token (operator + optional `-` +
 *   spaces + delimiter), the bare delimiter word, and whether `<<-` strips
 *   leading tabs from body lines; `null` if `i` is not a valid heredoc
 *   operator (a bare `<`, `<<<`, or a malformed delimiter) — the caller must
 *   then treat `cmd[i]` as ordinary text.
 */
export function parseHeredocOperator(
  cmd: string,
  i: number,
): { tokenEnd: number; word: string; stripTabs: boolean } | null {
  if (!(cmd[i] === "<" && cmd[i + 1] === "<" && cmd[i + 2] !== "<" && (i === 0 || cmd[i - 1] !== "<"))) {
    return null;
  }
  let j = i + 2;
  let stripTabs = false;
  if (cmd[j] === "-") { stripTabs = true; j += 1; }
  while (cmd[j] === " " || cmd[j] === "\t") j += 1;
  const parsed = parseDelimiter(cmd, j);
  return parsed ? { tokenEnd: parsed.end, word: parsed.word, stripTabs } : null;
}

/**
 * Finds the position right after a SINGLE heredoc's terminator line,
 * scanning RAW lines forward from `pos` (no lexing). A line matches when its
 * content — trailing `\r` trimmed, leading tabs trimmed first if
 * `stripTabs` — equals `word` exactly.
 *
 * `closeChar` (real-shell-verified, e.g. `` `cat <<'EOF'\nbody\nEOF` ``): on
 * the LAST line only (search text ran out, no trailing newline), a line
 * reading `word + closeChar` with ZERO characters between them ALSO
 * matches — the closer glues directly onto the delimiter. The match then
 * returns the closer's OWN index, unconsumed, so the caller's own
 * mode-termination check fires on it immediately next. `null` disables this
 * (bare word-only match required).
 * @returns The index right after the terminator line's trailing newline (or
 *   end-of-string, or the glued closer's own index for the `closeChar`
 *   case), or `null` if no matching line is found before end-of-string
 *   (fail-closed: unterminated).
 */
function findHeredocEnd(
  cmd: string,
  pos: number,
  word: string,
  stripTabs: boolean,
  closeChar: string | null,
): number | null {
  const n = cmd.length;
  let lineStart = pos;
  while (lineStart <= n) {
    const nl = cmd.indexOf("\n", lineStart);
    const hasNewline = nl !== -1;
    const lineEnd = hasNewline ? nl : n;
    let raw = cmd.slice(lineStart, lineEnd);
    if (stripTabs) raw = raw.replace(/^\t+/, "");
    const trimmed = raw.replace(/\r$/, "");
    if (trimmed === word) return hasNewline ? lineEnd + 1 : n;
    if (!hasNewline && closeChar !== null && trimmed === word + closeChar) return lineEnd - closeChar.length;
    if (!hasNewline) return null;
    lineStart = lineEnd + 1;
  }
  return null;
}

/**
 * Consumes every PENDING heredoc's body (opened on the logical line that
 * just ended), in order, starting right after the line's newline. Each
 * found heredoc's body+terminator lines are skipped entirely (the caller
 * emits nothing for them); the next pending heredoc is then searched from
 * there.
 *
 * The FIRST heredoc that fails to terminate stops the batch — fail CLOSED:
 * `terminated: false` tells the caller to append the ENTIRE remainder from
 * `pos` onward verbatim and stop scanning altogether. A prior design instead
 * resumed ORDINARY lexing over that remainder — but a body line shaped like
 * `<<Z` would then open a FAKE heredoc, itself terminate on a later
 * coincidental `Z` line, and erase a real write sitting between them. Nothing
 * hidden also means nothing in the remainder can trigger removal: only a
 * verbatim, unlexed copy is safe once a heredoc has already failed to close.
 * @param cmd - Raw shell command string.
 * @param startPos - Index right after the newline that ended the operator
 *   line (start of the first pending heredoc's body, if any).
 * @param pending - Heredocs opened on that line, in left-to-right order.
 * @param closeChar - Forwarded to {@link findHeredocEnd} for the glued-closer
 *   exception (backtick mode only — `null` for top-level/paren mode).
 * @returns `terminated: true` with the index to resume NORMAL scanning from,
 *   or `terminated: false` with the position the failed heredoc's body
 *   search began at (the caller copies `cmd.slice(pos)` verbatim and stops).
 */
export function consumeHeredocBodies(
  cmd: string,
  startPos: number,
  pending: readonly { word: string; stripTabs: boolean }[],
  closeChar: string | null,
): { terminated: true; pos: number } | { terminated: false; pos: number } {
  let pos = startPos;
  for (const heredoc of pending) {
    const end = findHeredocEnd(cmd, pos, heredoc.word, heredoc.stripTabs, closeChar);
    if (end === null) return { terminated: false, pos };
    pos = end;
  }
  return { terminated: true, pos };
}
