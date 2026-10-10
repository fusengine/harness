/**
 * Git-gate bypass pins (post-revert): the grep-pattern masking experiment was
 * ABANDONED (part C of the multi-pending fix) because it let REAL `git push`
 * executions slip through (`rg ' & git push & '`, ANSI-C quoting, pipes to
 * `sh`, `git grep -O…`, `--format=` smuggling). These tests pin the pre-fix
 * behavior: every one of those commands — and the original false-positive
 * `rg -n 'git push|CONFIRM' docs` — keeps its deny/ask decision; bare git
 * commands are unchanged. If the git gates ever change intentionally, update
 * these pins in the same commit with the security review attached.
 */
import { test, expect } from "bun:test";
import { evaluate } from "../src/policy/evaluate";

const kind = (command: string): string | undefined => evaluate({ tool: "Bash", command }).prompt?.kind;

test("the 5 challenger bypass payloads stay gated (ask) — no masking regression", () => {
  expect(kind("rg ' & git push & '")).toBe("ask");
  expect(kind("rg $'\\'' ; git push #'")).toBe("ask");
  expect(kind("rg -o 'git push' f | sh")).toBe("ask");
  expect(kind("git grep -O'git push' foo")).toBe("ask");
  expect(kind("git log --grep x --format='git push' | sh")).toBe("ask");
});

test("the original false positive is accepted as the safe default (ask, confirmed via CONFIRM)", () => {
  expect(kind("rg -n 'git push|CONFIRM' docs")).toBe("ask");
});

test("bare git commands unchanged: push asks, push --force blocks, status allows", () => {
  expect(kind("git push")).toBe("ask");
  expect(kind("git push --force")).toBe("block");
  expect(evaluate({ tool: "Bash", command: "git status" }).decision).toBe("allow");
});
