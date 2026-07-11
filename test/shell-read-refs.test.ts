import { test, expect } from "bun:test";
import { shellReadRefPaths } from "../src/policy/shell-read-refs";

test("cat of a .md ref is credited", () => {
  expect(shellReadRefPaths("cat skills/security-scan/references/scan-patterns.md")).toEqual([
    "skills/security-scan/references/scan-patterns.md",
  ]);
});

test("head/tail/less/more/bat/rg are all credited", () => {
  for (const cmd of ["head", "tail", "less", "more", "bat", "rg"]) {
    expect(shellReadRefPaths(`${cmd} skills/react/references/hooks.md`)).toEqual(["skills/react/references/hooks.md"]);
  }
});

test("sed without -i credits its .md argument", () => {
  expect(shellReadRefPaths("sed -n '1,50p' skills/solid/references/srp.md")).toEqual(["skills/solid/references/srp.md"]);
});

test("sed -i / --in-place is a MUTATION, never credited", () => {
  expect(shellReadRefPaths("sed -i 's/a/b/' skills/solid/references/srp.md")).toEqual([]);
  expect(shellReadRefPaths("sed --in-place 's/a/b/' skills/solid/references/srp.md")).toEqual([]);
});

test("a non-read command is never credited (fail-open)", () => {
  expect(shellReadRefPaths("echo hi > skills/solid/references/srp.md")).toEqual([]);
  expect(shellReadRefPaths("mv a.md skills/solid/references/srp.md")).toEqual([]);
  expect(shellReadRefPaths("rm skills/solid/references/srp.md")).toEqual([]);
});

test("a redirection target is written, not read", () => {
  expect(shellReadRefPaths("cat plan.txt > skills/solid/references/srp.md")).toEqual([]);
});

test("chained/piped segments are scanned independently", () => {
  expect(shellReadRefPaths("cat a.md && grep foo b.md; tail c.md")).toEqual(["a.md", "c.md"]);
  expect(shellReadRefPaths("cat a.md | grep foo")).toEqual(["a.md"]);
});

test("Codex argv-array bash -c wrapper is unwrapped", () => {
  expect(shellReadRefPaths(["bash", "-lc", "cat skills/react/references/hooks.md"])).toEqual([
    "skills/react/references/hooks.md",
  ]);
});

test("inline string bash -c wrapper is unwrapped too", () => {
  expect(shellReadRefPaths('bash -c "cat skills/react/references/hooks.md"')).toEqual([
    "skills/react/references/hooks.md",
  ]);
});

test("absent/unparseable command yields nothing", () => {
  expect(shellReadRefPaths(undefined)).toEqual([]);
  expect(shellReadRefPaths(null)).toEqual([]);
  expect(shellReadRefPaths(42)).toEqual([]);
  expect(shellReadRefPaths([])).toEqual([]);
});

test("a flag-like token ending in .md is not credited", () => {
  expect(shellReadRefPaths("cat --foo.md")).toEqual([]);
});
