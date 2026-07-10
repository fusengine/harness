import type { Prompt } from "../prompt/types";

/**
 * Shell metacharacters that turn a "simple" command into a chained/composite
 * one: `&&`, `||`, `;`, `|`, a lone background `&` (POSIX control operator —
 * `cmd1 & cmd2` runs BOTH; `&(?!>)` excludes bash's `&>`/`&>>` redirects, which
 * cannot introduce a second command), a backtick, `$(`, or a literal newline.
 * Bounded alternation, no nested quantifiers — no ReDoS. Quote-unaware by
 * design: a quoted `"R&D"` gates as ask (fail-closed).
 */
const CHAIN_RE = /&&|\|\||[;|`]|&(?!>)|\$\(|\n/;

/**
 * True when `cmd` has no chaining operator. evaluate.ts's neverApproval
 * exemption must NEVER fire on a composite command — `git commit -m x &&
 * git push --force` would otherwise slip a blocked op past the RALPH_SAFE
 * subset check, since that check is a `startsWith` on the leading verb only.
 */
export function isSingleCommand(cmd: string): boolean {
  return !CHAIN_RE.test(cmd);
}

/** Next steps offered on the auto-approve notice — the only channel left once `ask` is unavailable. */
const ACTIONS: readonly string[] = [
  "Set approval_policy=on-request for interactive confirmation",
  "Or set RALPH_MODE=1 to auto-approve silently (no notice)",
  "Or run the command manually outside the agent loop",
];

/**
 * Builds the auto-approve `inform` prompt for a command evaluate.ts has
 * already proven safe (RALPH_SAFE subset, not GIT_BLOCKED, not chained —
 * see {@link isSingleCommand}). Pure formatting only; the 3-condition
 * decision itself lives in evaluate.ts, where the anti-chaining guarantee
 * must stay visible and auditable.
 * @param cmd - The already-vetted command.
 */
export function buildNeverApprovalPrompt(cmd: string): Prompt {
  const trimmed = cmd.trim();
  const reason = `Auto-approved "${trimmed}" under approval_policy=never.`;
  return {
    kind: "inform",
    title: "Auto-approved (approval_policy=never)",
    reason,
    actions: [...ACTIONS],
    userMessage: `[fuse-harness] Auto-approved "${trimmed}" — approval_policy=never has no ask channel. Destructive git commands still deny. Set approval_policy=on-request, or RALPH_MODE=1, to keep asking.`,
  };
}
