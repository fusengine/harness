import { closingArithmetic } from "./bash-write-quotes";
import { consumeHeredocBodies, parseHeredocOperator } from "./bash-write-lexer-heredoc";
import { collapseSeparators } from "./bash-write-lexer-collapse";
import { lexBacktick, lexCommandSubst } from "./bash-write-lexer-subst";
import type { LexMode, LexResult } from "./bash-write-lexer-subst";
import { consumeQuoted } from "./bash-write-lexer-quote";

/** POSIX §2.3 rule-6 operator-start chars ending a word, for the `#`-comment
 *  word-start check below (`<`/`>` are handled by the heredoc/arithmetic
 *  branches first, so a bare one never reaches this class). */
const WORD_BREAK = /[;&|()]/;

/**
 * Public entry point: lexes a full command at nesting depth 0, then
 * collapses separators ONCE, at the outermost call only — a substitution's
 * interior returned by {@link lexBody} is never separately collapsed.
 * @param cmd - Raw shell command string (heredoc/piped body included).
 * @returns The command-position ANCHOR text: quote/comment content
 *   stripped, arithmetic erased, heredoc bodies removed, substitution
 *   bodies recursively lexed, and separators collapsed to a minimal width.
 */
export function anchorText(cmd: string): string {
  return collapseSeparators(lexBody(cmd, 0, "top").out);
}

/**
 * Single left-to-right shell-text lexer producing anchor text — RECURSABLE
 * on a substitution's interior via `mode`: bash-write-lexer-subst.ts's
 * {@link lexCommandSubst}/{@link lexBacktick} call this function back at
 * `depth + 1` in `"paren"`/`"backtick"` mode, so a `$(...)`/backtick body
 * gets the SAME heredoc/comment/quote/arithmetic treatment — AND its own
 * closing delimiter found by this SAME state machine, never a separate
 * heredoc-blind scanner (2026-09-06 v15 fix: a heredoc BODY nested inside a
 * substitution, e.g. `"$(cat <<'EOF'\ndoesn't\nEOF\n)"` — real Claude Code
 * commit form — used to spill a stray `'` into a separate boundary-finder's
 * quote state, mis-locating the `)` and reading the body as live text).
 *
 * `#`-comment word-start: a `wordStart` flag carried ACROSS iterations
 * decides this, never the raw char before `#` alone. `echo $((1))#; x`
 * runs BOTH commands in real bash — arithmetic's closing `))` is mid-word
 * (POSIX §2.3 rule 8) so a following `#` is not a comment. `wordStart` is
 * true after a newline or a whitespace/{@link WORD_BREAK} char; false
 * after arithmetic, a substitution splice, an escape, or a quoted span.
 *
 * Quote content is dropped (chars kept) except a `$(...)`/backtick span
 * INSIDE a dquote, recursively lexed (POSIX §2.2.3 keeps those special
 * there). `$((...))` is dropped wholesale. Heredoc handling delegates to
 * bash-write-lexer-heredoc.ts ({@link consumeHeredocBodies}: fail-CLOSED
 * unterminated contract). Escapes emit nothing. Fail-closed: an
 * unterminated quote/`$((`/substitution emits the raw remainder as-is.
 *
 * `mode` self-termination: `"paren"` tracks a LOCAL paren depth starting at
 * 1 (the `$(` already consumed by the caller) — a bare `(` increments it, a
 * bare `)` decrements it, and reaching 0 returns immediately (the caller's
 * closing paren, POSIX §2.3 rule 9 splice). A NESTED `$(...)`/backtick found
 * along the way is handled by the ordinary branches below, which recurse
 * through {@link lexCommandSubst}/{@link lexBacktick} and consume their OWN
 * matched pair atomically — so only genuinely bare grouping parens ever
 * reach this mode's counter. `"backtick"` mode returns as soon as an
 * unescaped raw backtick is seen (backticks don't nest unescaped).
 * @param cmd - Raw shell text to lex: a full command at `depth` 0/`"top"`,
 *   or a substitution's interior text at `depth` > 0 in `"paren"`/
 *   `"backtick"` mode.
 * @param depth - Current nesting depth; bounds recursion via
 *   `MAX_SUBST_DEPTH` in bash-write-lexer-subst.ts.
 * @param mode - Which terminator (if any) ends this call early; see above.
 * @returns The anchor text produced (NOT separator-collapsed), the index in
 *   `cmd` right after the found terminator, and whether one was found
 *   (`"top"` is always `true`; a fail-closed `false` means `cmd` ran out
 *   first and the caller must treat the whole substitution as unterminated).
 */
function lexBody(cmd: string, depth: number, mode: LexMode): LexResult {
  const n = cmd.length;
  let out = "";
  let i = 0;
  let wordStart = true;
  let parenDepth = mode === "paren" ? 1 : 0;
  const pending: { word: string; stripTabs: boolean }[] = [];

  while (i < n) {
    const ch = cmd[i];

    if (ch === "\n") {
      out += "\n";
      i += 1;
      wordStart = true;
      if (pending.length > 0) {
        const closeChar = mode === "backtick" ? "`" : null;
        const result = consumeHeredocBodies(cmd, i, pending, closeChar);
        pending.length = 0;
        if (!result.terminated) { out += cmd.slice(result.pos); i = n; break; }
        i = result.pos;
      }
      continue;
    }

    if (ch === "#" && wordStart) {
      while (i < n && cmd[i] !== "\n") i += 1;
      continue;
    }

    if (ch === "<") {
      const heredoc = parseHeredocOperator(cmd, i);
      if (heredoc) {
        out += cmd.slice(i, heredoc.tokenEnd);
        pending.push({ word: heredoc.word, stripTabs: heredoc.stripTabs });
        i = heredoc.tokenEnd;
        wordStart = false;
        continue;
      }
    }

    if (ch === "$" && cmd[i + 1] === "(" && cmd[i + 2] === "(") {
      const close = closingArithmetic(cmd, i + 3);
      if (close < 0) { out += cmd.slice(i); i = n; continue; }
      out += " ";
      i = close;
      wordStart = false;
      continue;
    }

    if (ch === "$" && cmd[i + 1] === "(") {
      const result = lexCommandSubst(cmd, i, depth, lexBody);
      out += result.text;
      i = result.next;
      wordStart = false;
      continue;
    }

    if (ch === "`") {
      if (mode === "backtick") return { out, end: i + 1, terminated: true };
      const result = lexBacktick(cmd, i, depth, lexBody);
      out += result.text;
      i = result.next;
      wordStart = false;
      continue;
    }

    if (ch === "\\" && i + 1 < n) { i += 2; wordStart = false; continue; }

    if (ch === "'" || ch === '"') {
      const result = consumeQuoted(cmd, i, ch, depth, lexBody);
      out += result.text;
      i = result.next;
      wordStart = false;
      continue;
    }

    if (mode === "paren" && (ch === "(" || ch === ")")) {
      if (ch === "(") parenDepth += 1;
      else if (--parenDepth === 0) return { out, end: i + 1, terminated: true };
    }

    out += ch;
    i += 1;
    wordStart = /\s/.test(ch ?? "") || WORD_BREAK.test(ch ?? "");
  }

  return { out, end: n, terminated: mode === "top" };
}
