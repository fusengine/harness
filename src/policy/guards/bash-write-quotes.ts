/**
 * Arithmetic-span helper for the Bash write guard's lexer
 * (bash-write-lexer.ts). Split into its own file historically alongside the
 * now-removed `stripQuoted` quote-stripping preprocessor (2026-09-05
 * redesign moved heredoc/quote handling into `unquotedShellText`
 * (bash-write-unquoted.ts) + `anchorText`, making `stripQuoted` and its
 * private heredoc-delimiter helpers, plus its `closingCommandSubst`/
 * `closingBacktick` internal helpers, dead code — all deleted here). Only
 * {@link closingArithmetic} remains, imported by bash-write-lexer.ts to
 * skip over `$((...))` arithmetic spans, whose `((`/`))` would otherwise be
 * mistaken for nested parens.
 */

/**
 * Finds the index right after the `))` matching a `$((` whose body starts
 * at `start` (right after the second `(`). `depth` starts at 1 for that
 * second `(`; a nested `(` increments it, and only a `)` at depth 1
 * immediately followed by another `)` closes it. Returns `input.length` if
 * unterminated.
 */
export function closingArithmetic(input: string, start: number): number {
  let depth = 1;
  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (ch === "\\" && i + 1 < input.length) { i += 1; continue; }
    if (ch === "(") { depth += 1; continue; }
    if (ch === ")") {
      if (depth === 1 && input[i + 1] === ")") return i + 2;
      depth -= 1;
    }
  }
  return input.length;
}
