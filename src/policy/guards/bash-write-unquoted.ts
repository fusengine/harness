import { anchorText } from "./bash-write-lexer";

/**
 * Produces the UNQUOTED, DATA-STRIPPED view of a shell command that the
 * write guard's command-position anchors are tested against — never the raw
 * `cmd` itself (that stays the input for the write-API/CODE_FILE_LITERAL
 * checks in bash-write.ts).
 *
 * Redesign (2026-09-05, owner-measured, second iteration): this used to be
 * a fixed pipeline of independent passes (quotes, then comments, then
 * heredoc bodies, then separator collapsing) — but two orderings of that
 * pipeline both had a real bypass. Heredoc-detection-last let a `<<WORD`
 * inside a comment or a quoted continuation line disarm a later real write
 * (a fake heredoc "opened" there could delete everything up to a
 * coincidentally matching later line). Quotes-first — this file's
 * PREVIOUS version — let an unbalanced quote INSIDE a heredoc BODY swallow
 * the real terminator and the write after it, because the quote scanner had
 * no notion that a heredoc body is not shell syntax at all. Both bugs share
 * one root cause: no fixed pass ORDER can be correct, because whether a
 * span of text is "quoted", "commented", or "heredoc data" can only be
 * decided by tracking all of them TOGETHER, left to right, in the order the
 * shell itself would. `anchorText` (bash-write-lexer.ts) is that single
 * state machine; this function now only forwards to it.
 * @param cmd - Raw shell command string (heredoc/piped body included).
 * @returns The command with quoted segment content stripped, comments
 *   stripped, heredoc bodies removed, and separators collapsed — safe to
 *   test the command-position anchors against.
 */
export function unquotedShellText(cmd: string): string {
  return anchorText(cmd);
}
