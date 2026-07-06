/**
 * Command-position anchoring for the Bash write guard — the regex prefix that
 * tells a real mutator invocation apart from a quoted/argument mention of the
 * same token. Consumed by bash-write-patterns.ts (CODE_MUTATORS, CODE_COMMAND_WRITE).
 */

/**
 * Transparent exec wrappers that run another command as their argument
 * (`env sed -i …`, `timeout 5 patch …`, `sudo -n tee …`, `xargs sed -i`). A code
 * mutator behind one is still a code mutator — the wrapper is not a shield.
 */
const WRAP = "(?:env|timeout|nice|nohup|sudo|command|stdbuf|time|ionice|exec|xargs)";

/**
 * A wrapper's own leading arg tokens: `VAR=val` assignments, `-f`/`--flag`
 * options, or a bare duration/number (`timeout 5`, `nice -n 10`). The flag form
 * is `--?[^\s-]\S*` (not `-{1,2}\S+`) so a dash-run has ONE decomposition — the
 * `-`/`--` ambiguity under the outer `*` is a ReDoS vector (OWASP ReDoS). Every
 * alternative consumes ≥1 char and is followed by a mandatory `\s+`, so the
 * repeated group is never zero-width (no `(X*)*` catastrophic shape).
 */
const WRAP_ARG = "(?:\\w+=\\S+|--?[^\\s-]\\S*|\\d+[smhd]?)";

/**
 * Command-position anchor: line/segment start or a `;&|(` separator, then any
 * chain of {@link WRAP} wrappers (each with its own {@link WRAP_ARG} tokens).
 * Anchoring a write motif here makes it fire on a real invocation
 * (`env sed -i x src/a.ts`) while ignoring a quoted/argument MENTION of the same
 * text (`git commit -m "fix sed -i doc"`, `npm run t -- --grep "sed -i"`), which
 * is never at a command position.
 *
 * Defense-in-depth first pass, NOT the sole control: regex-on-raw-string is
 * lossy vs a real shell lexer. Known residual gaps (enumerated, not silently
 * assumed away): command substitution `$(…)`/backticks, indirect exec via
 * `bash -c`/`eval`/`find -exec`, process substitution `<(…)`, shell-quoting
 * tricks (`s''ed`, `${x}ed`), and variable-indirection targets (`tee $F`). Those
 * need a tokenizer, out of scope here; the Write/Edit tool gate stays the
 * backstop for what slips through.
 */
export const CMD: string = `(?:^|[\\n;&|(])\\s*(?:${WRAP}\\s+(?:${WRAP_ARG}\\s+)*)*`;
