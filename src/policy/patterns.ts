/**
 * Guard pattern data, ported verbatim from the fusengine git/install guards.
 * Note (faithful): `git push.*--force` also matches `--force-with-lease` —
 * preserved from the source guard.
 */

/** Destructive git operations to block outright. */
export const GIT_BLOCKED: ReadonlyArray<RegExp> = [
  /git push.*--force/, /git push.*-f/, /git reset.*--hard/,
  /git clean.*-fd/, /git branch.*-D/, /git rebase.*--force/,
];

/** Git operations that warrant a confirmation prompt. */
export const GIT_ASK: ReadonlyArray<RegExp> = [
  /git push/, /git checkout/, /git reset/, /git rebase/, /git merge/,
  /git stash/, /git clean/, /git rm/, /git mv/, /git restore/,
  /git revert/, /git cherry-pick/, /git commit/, /git add/, /git branch -d/,
];

/** System-level package installs (need confirmation). */
export const SYSTEM_INSTALL: ReadonlyArray<RegExp> = [
  /brew install/, /brew upgrade/, /brew cask/, /apt install/, /apt-get install/,
  /dnf install/, /pacman -S/,
];

/** Project-level package installs. */
export const PROJECT_INSTALL: ReadonlyArray<RegExp> = [
  /npm install/, /npm i /, /yarn add/, /pnpm add/, /pip install/, /pip3 install/,
  /composer require/, /bun add/, /bun install/, /cargo install/, /go install/,
  /gem install/, /pipx install/,
];

/** True when `cmd` matches any pattern in `patterns`. */
export function matchPatterns(cmd: string, patterns: ReadonlyArray<RegExp>): boolean {
  return patterns.some((re) => re.test(cmd));
}

/** Git commands exempt from confirmation when Ralph mode is on (parity git-guard.py RALPH_SAFE). */
export const RALPH_SAFE: ReadonlyArray<string> = [
  "git add", "git commit", "git checkout -b", "git branch --show-current",
  "git status", "git diff", "git log",
];

/**
 * OPT-IN autonomous "Ralph" mode: OFF unless `RALPH_MODE` is `1`/`true`, read
 * fresh on each call. Only the env var activates it — the Python source also
 * auto-enabled on a `.claude/ralph/prd.json` file or a `feature/*` branch, but
 * those silent activations are dropped here: a mode that removes git/install
 * confirmations must never turn on implicitly (owner: default OFF, env opt-in).
 */
export function isRalphMode(): boolean {
  const v = process.env.RALPH_MODE;
  return v === "1" || v === "true";
}
