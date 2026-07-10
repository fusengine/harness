import type { Prompt } from "../prompt/types";
import { RALPH_SAFE } from "./patterns";

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

/**
 * Commands exempt from `ask` under Codex `approval_policy=never` — a superset
 * of {@link RALPH_SAFE} plus `git push`. Kept as its OWN list, never merged
 * into RALPH_SAFE: the RALPH_MODE path (evaluate.ts's `ralphSafe`) has no
 * equivalent to {@link isSafePushForm}, only the shared GIT_BLOCKED +
 * isSingleCommand guards — adding push to RALPH_SAFE would auto-allow
 * `git push origin --delete branch` under RALPH_MODE, since GIT_BLOCKED only
 * covers force-push, not remote deletion. Only the neverApproval path in
 * evaluate.ts consults NEVER_SAFE, and it always pairs it with
 * isSafePushForm for any push entry.
 */
export const NEVER_SAFE: ReadonlyArray<string> = [...RALPH_SAFE, "git push"];

/**
 * `--delete`/`-d` (git-push(1): "deleted from the remote repository", no
 * `--force` needed), `--mirror` (force-updates AND deletes remote-only refs),
 * `--prune` (removes remote refs with no local counterpart) — all delete or
 * force-overwrite a remote ref without going through the `--force` flag
 * GIT_BLOCKED already checks. Boundary-anchored like patterns.ts's FORCE_FLAG
 * so `-d` never matches inside a longer token (e.g. a branch name).
 */
const PUSH_DESTRUCTIVE_FLAG = /\s(?:--delete|--mirror|--prune|-d)(?:\s|=|$)/;
/** A refspec colon (e.g. `git push origin :branch`) deletes the remote ref — the legacy form of `--delete` (git-push(1): "prefixing all refs with a colon"). */
const REFSPEC_COLON = /\s:\S/;
/**
 * A leading `+` on a pushed refspec force-updates the remote ref on a
 * non-fast-forward — git-push(1): "The `+` is optional and does the same thing
 * as `--force`". It carries NO `--force`/`-f` flag, so GIT_BLOCKED's FORCE_FLAG
 * misses it; this guard is the `--force` twin. The `\s` anchor makes `+` open
 * its token (`+main`, `+src:dst`), never a mid-token `feature+x` ref name.
 */
const REFSPEC_FORCE = /\s\+\S/;

/**
 * True unless `cmd` is a `git push` carrying an irreversible remote-mutation
 * form GIT_BLOCKED doesn't already cover: `--delete`/`-d`/`--mirror`/`--prune`,
 * a `:refspec` remote-delete, or a `+refspec` force-update (the `--force` twin
 * FORCE_FLAG misses). Plain `--force`/`-f` stays GIT_BLOCKED's job, checked
 * upstream in evaluate.ts. Non-push commands always pass — this guard exists
 * solely to narrow the `git push` entry of {@link NEVER_SAFE}.
 */
export function isSafePushForm(cmd: string): boolean {
  if (!cmd.startsWith("git push")) return true;
  return !PUSH_DESTRUCTIVE_FLAG.test(cmd) && !REFSPEC_COLON.test(cmd) && !REFSPEC_FORCE.test(cmd);
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
