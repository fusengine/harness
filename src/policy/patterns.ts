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
