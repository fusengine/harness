import { lexBacktick, lexCommandSubst } from "./bash-write-lexer-subst";
import type { LexBody } from "./bash-write-lexer-subst";

/**
 * Consumes a single- or double-quoted span starting at `at` (`cmd[at]` is
 * the opening quote character), for {@link lexBody} (bash-write-lexer.ts).
 * Split into its own file to keep that file under the SOLID line ceiling.
 *
 * Content is dropped (quote chars kept) EXCEPT a `$(...)`/backtick span
 * found INSIDE a DQUOTE, which is recursively lexed via
 * {@link lexCommandSubst}/{@link lexBacktick} (POSIX §2.2.3 keeps those
 * special even inside double quotes — see bash-write-lexer.ts's `lexBody`
 * JSDoc for the heredoc-inside-substitution regression this machinery
 * fixes). Single quotes have no escaping/expansion, so neither special
 * branch below ever fires for `quoteChar === "'"`.
 *
 * Unterminated: fail-closed — returns the RAW remainder from `at` to end of
 * string, unchanged.
 * @param cmd - Raw shell command string.
 * @param at - Index of the opening quote character.
 * @param quoteChar - Which quote is open (`'` or `"`).
 * @param depth - Current nesting depth, forwarded to any `$(...)`/backtick
 *   span found inside this quote.
 * @param lexBody - The caller's own recursive lexer, passed in (not
 *   imported) to avoid a circular dependency with bash-write-lexer.ts.
 * @returns The text to append to the anchor output, and the index to
 *   resume scanning from.
 */
export function consumeQuoted(
  cmd: string,
  at: number,
  quoteChar: "'" | '"',
  depth: number,
  lexBody: LexBody,
): { text: string; next: number } {
  const n = cmd.length;
  let text = quoteChar;
  let i = at + 1;
  while (i < n) {
    const c = cmd[i];
    if (quoteChar === '"' && c === "\\" && i + 1 < n) { i += 2; continue; }
    if (quoteChar === '"' && c === "$" && cmd[i + 1] === "(") {
      const result = lexCommandSubst(cmd, i, depth, lexBody);
      text += result.text;
      i = result.next;
      continue;
    }
    if (quoteChar === '"' && c === "`") {
      const result = lexBacktick(cmd, i, depth, lexBody);
      text += result.text;
      i = result.next;
      continue;
    }
    if (c === quoteChar) return { text: text + quoteChar, next: i + 1 };
    i += 1;
  }
  return { text: cmd.slice(at), next: n };
}
