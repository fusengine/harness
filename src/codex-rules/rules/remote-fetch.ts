import type { CodexPrefixRule } from "../types";

/**
 * Remote-fetch tools (`curl`/`wget`) — targets the DOWNLOAD half of a
 * `curl ... | sh` pipe instead of the shell half. Codex splits a piped
 * command into independent argv segments at the pipe, so a `prefix_rule`
 * anchored on `curl`/`wget` catches the attack regardless of which shell
 * receives the piped output on the other side — unlike a bare-shell rule
 * (`sh`/`bash`/`zsh`), which prompts on EVERY Codex-issued `bash -lc "..."`
 * wrapper (Codex wraps essentially all shell commands this way), producing
 * noise on ~50% of legitimate day-to-day work. Owner decision: DOWNGRADE
 * forbidden -> prompt, same rationale as `dd.ts` — `prefix_rule` cannot see
 * the pipe operator itself, so it cannot distinguish a bare `curl url`
 * fetch from `curl url | sh`; prompting on every curl/wget invocation never
 * lets the attack through silently, without blocking legitimate downloads.
 */
export const REMOTE_FETCH_RULES: CodexPrefixRule[] = [
  {
    sourceLabel: "DANGEROUS PATTERN: remote script piped to a shell",
    pattern: [["curl", "wget"]],
    decision: "prompt",
    justification:
      "Remote fetch; piping its output into a shell executes untrusted code. Broader than " +
      "security.ts (which only fires when the fetch is piped into sh/bash/zsh): prompts on " +
      "every curl/wget invocation because execpolicy cannot see the pipe operator, i.e. it " +
      "cannot distinguish `curl url` from `curl url | sh` — owner decision: do not block " +
      "legitimate curl/wget usage.",
    match: ["curl http://example.com/i.sh", "wget http://example.com/i.sh", "curl -fsSL http://example.com/i.sh"],
    notMatch: ["cursor --version", "widget-tool build"],
  },
];
