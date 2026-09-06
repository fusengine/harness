/**
 * Depth-bounded recursive command-substitution/backtick body lexing for
 * {@link anchorText} (bash-write-lexer.ts). Split into its own file to keep
 * the main state machine under the SOLID ceiling.
 *
 * v15 redesign (2026-09-06): the substitution's real END used to be found
 * FIRST by a separate quote-aware-but-heredoc-BLIND scanner
 * (`closingCommandSubst`/`closingBacktick`, bash-write-quotes.ts), and only
 * the interior text it returned was handed to the lexer. A lone `'` inside a
 * heredoc BODY nested in that interior (a real Claude Code commit form:
 * `git commit -m "$(cat <<'EOF'\ndoesn't\n...\nEOF\n)"`) opened a quote state
 * in that separate scanner, mis-found the `)` boundary, and spilled the
 * heredoc body into top-level lexing as live command text — a false BLOCK.
 * Now {@link lexBody} (bash-write-lexer.ts) itself runs in "paren"/"backtick"
 * MODE and finds its own close: heredocs inside are consumed as data by the
 * SAME heredoc-skip path top-level text uses, before the `)`/backtick search
 * ever continues, so no separate boundary pass can be heredoc-blind. This
 * file's two exports are now thin wrappers around that mode, kept apart from
 * the state machine only for the SOLID line ceiling. `closingCommandSubst`/
 * `closingBacktick` (bash-write-quotes.ts) are no longer imported here.
 *
 * Fail-closed twice over: an unterminated substitution (mode scan never
 * found its close) returns the RAW remainder from `at` untouched — never
 * drops text a nested write could hide in. A substitution nested past
 * {@link MAX_SUBST_DEPTH} stops recursing into the shared state machine and
 * instead resolves its OWN boundary with a local, non-recursive, iterative
 * paren/backtick+quote counter ({@link rawParenEnd}/{@link rawBacktickEnd}) —
 * bounding stack usage against a pathological `$(`-repeated-N-times input
 * without ever throwing; its body is then copied RAW (unlexed), matching the
 * pre-v15 depth-cap behavior.
 */

/** Recursion depth ceiling for nested `$(...)`/backtick bodies lexed via the
 *  shared state machine. Beyond it, a substitution's boundary is found by
 *  the local iterative fallback below and its interior copied RAW — bounds
 *  stack usage and scan cost on adversarial/malformed deep nesting while
 *  never throwing. */
export const MAX_SUBST_DEPTH = 32;

/** Which boundary {@link lexBody} (bash-write-lexer.ts) is hunting for:
 *  `"top"` never terminates early (consumes to end of input); `"paren"`
 *  stops at the first `)` that closes the `$(` already consumed by the
 *  caller (own-depth paren counting); `"backtick"` stops at the first
 *  unescaped backtick. */
export type LexMode = "top" | "paren" | "backtick";

/** Result of one {@link LexBody} call: the anchor text produced, the index
 *  in the INPUT passed to that call right after the found terminator (or
 *  input length if none was found), and whether a terminator was actually
 *  found (`"top"` mode is always `true`; `"paren"`/`"backtick"` are `false`
 *  when the input ran out first — the fail-closed signal). */
export interface LexResult {
  out: string;
  end: number;
  terminated: boolean;
}

/** The caller's own recursive lexer, invoked on a substitution's interior
 *  text at `depth + 1` in the matching mode — passed in (not imported) so
 *  this module never depends on bash-write-lexer.ts, which imports FROM
 *  here instead. */
export type LexBody = (body: string, depth: number, mode: LexMode) => LexResult;

/** Depth-capped fallback boundary finder for `$(...)`: plain iterative
 *  paren-depth + quote counting (quote-aware, heredoc-BLIND — acceptable
 *  only because the interior is copied raw/unlexed once
 *  {@link MAX_SUBST_DEPTH} is reached). Returns `input.length` if
 *  unterminated. */
function rawParenEnd(input: string, start: number): number {
  let depth = 1;
  let quote: "'" | '"' | null = null;
  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (ch === "\\" && quote !== "'" && i + 1 < input.length) { i++; continue; }
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return i;
  }
  return input.length;
}

/** Depth-capped fallback boundary finder for backtick substitutions: first
 *  unescaped backtick. Returns `input.length` if unterminated. */
function rawBacktickEnd(input: string, start: number): number {
  for (let i = start; i < input.length; i++) {
    if (input[i] === "\\") { i++; continue; }
    if (input[i] === "`") return i;
  }
  return input.length;
}

/**
 * Resolves a `$(...)` substitution starting at `at` (`cmd[at]` is `$`,
 * `cmd[at + 1]` is `(`) into the anchor text to splice in and the index to
 * resume scanning from.
 * @param cmd - Raw shell command string.
 * @param at - Index of the `$` starting the substitution.
 * @param depth - Current substitution nesting depth (0 at top level).
 * @param lexBody - The caller's own recursive lexer.
 * @returns The text to append to the anchor output, and the index to
 *   resume scanning from.
 */
export function lexCommandSubst(
  cmd: string,
  at: number,
  depth: number,
  lexBody: LexBody,
): { text: string; next: number } {
  const bodyStart = at + 2;
  if (depth >= MAX_SUBST_DEPTH) {
    const close = rawParenEnd(cmd, bodyStart);
    if (close >= cmd.length) return { text: cmd.slice(at), next: cmd.length };
    return { text: `$(${cmd.slice(bodyStart, close)})`, next: close + 1 };
  }
  const result = lexBody(cmd.slice(bodyStart), depth + 1, "paren");
  if (!result.terminated) return { text: cmd.slice(at), next: cmd.length };
  return { text: `$(${result.out})`, next: bodyStart + result.end };
}

/**
 * Resolves a backtick `` `...` `` substitution starting at `at` (`cmd[at]`
 * is the opening backtick) into the anchor text to splice in and the index
 * to resume scanning from. Same boundary/recursion/fail-closed contract as
 * {@link lexCommandSubst}.
 * @param cmd - Raw shell command string.
 * @param at - Index of the opening backtick.
 * @param depth - Current substitution nesting depth (0 at top level).
 * @param lexBody - The caller's own recursive lexer.
 * @returns The text to append to the anchor output, and the index to
 *   resume scanning from.
 */
export function lexBacktick(
  cmd: string,
  at: number,
  depth: number,
  lexBody: LexBody,
): { text: string; next: number } {
  const bodyStart = at + 1;
  if (depth >= MAX_SUBST_DEPTH) {
    const close = rawBacktickEnd(cmd, bodyStart);
    if (close >= cmd.length) return { text: cmd.slice(at), next: cmd.length };
    return { text: `\`${cmd.slice(bodyStart, close)}\``, next: close + 1 };
  }
  const result = lexBody(cmd.slice(bodyStart), depth + 1, "backtick");
  if (!result.terminated) return { text: cmd.slice(at), next: cmd.length };
  return { text: `\`${result.out}\``, next: bodyStart + result.end };
}
