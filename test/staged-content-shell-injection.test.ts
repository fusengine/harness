import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stagedContent } from "../src/cli/run";

/**
 * Regression test for the shell-injection reported in issue #87: a staged
 * filename containing a command substitution (`` `...` `` / `$(...)`) must
 * NOT be interpreted by a shell when `stagedContent` reads its staged blob
 * via `git show`. Exercises the real entry point (`stagedContent`) against
 * an isolated temporary git repo — never the real repo — and cleans up in
 * `finally` regardless of outcome.
 */
test("stagedContent: a filename with shell metacharacters is never executed by a shell", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-issue-87-"));
  const marker = join(repo, "pwned.txt");
  try {
    execFileSync("git", ["init", "-q"], { cwd: repo });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
    execFileSync("git", ["config", "user.name", "test"], { cwd: repo });

    // Filename carries a command substitution that would create `marker` if
    // ever handed to a shell (`sh -c "git show \":${path}\""`). Kept relative
    // (no `/`) since a filename component cannot embed a path separator —
    // `stagedContent` runs with `cwd` pinned to `repo` (see below).
    const evilName = "x`touch pwned.txt`.ts";
    writeFileSync(join(repo, evilName), "content\n");
    execFileSync("git", ["add", "--", evilName], { cwd: repo });

    const content = stagedContentAt(repo, evilName);

    expect(content).toBe("content\n");
    expect(existsSync(marker)).toBe(false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(marker, { force: true });
  }
});

/** Runs the real `stagedContent` implementation with `cwd` pinned to `repo`. */
function stagedContentAt(repo: string, path: string): string {
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    return stagedContent(path);
  } finally {
    process.chdir(cwd);
  }
}
