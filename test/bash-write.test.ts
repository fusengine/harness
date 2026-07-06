import { test, expect } from "bun:test";
import { bashWriteGuard } from "../src/policy/guards/bash-write";
import type { GuardContext } from "../src/policy/guards/context";

test("blocks sed -i on a code file", () => {
  const ctx: GuardContext = { tool: "Bash", command: "sed -i 's/foo/bar/' src/index.ts" };
  expect(bashWriteGuard(ctx)?.kind).toBe("block");
});

test("blocks redirect to a code-file extension + python3 -c", () => {
  expect(bashWriteGuard({ tool: "Bash", command: "echo x > app.tsx" })?.kind).toBe("block");
  expect(bashWriteGuard({ tool: "Bash", command: "python3 -c 'print(1)'" })?.kind).toBe("block");
});

test("asks before redirect to a non-code file", () => {
  expect(bashWriteGuard({ tool: "Bash", command: "echo log >> out.txt" })?.kind).toBe("ask");
});

test("passes a plain read + non-Bash tool", () => {
  expect(bashWriteGuard({ tool: "Bash", command: "ls -la src" })).toBeNull();
  expect(bashWriteGuard({ tool: "Write", command: "sed -i x a.ts" })).toBeNull();
});

// bash-write-safe-paths.ts: node -e safe-path quote-anchoring + tilde/prefix edge cases.

test("allows node -e appendFile to a quoted safe sub-path", () => {
  expect(bashWriteGuard({ tool: "Bash", command: "node -e \"fs.appendFileSync('~/.fuse-harness/cache/x.json', data)\"" })).toBeNull();
});

test("asks for node -e write when the safe path is only in an unquoted comment", () => {
  // Fail-closed: substring presence in an inert comment must NOT satisfy hasSafeWriteTarget.
  expect(bashWriteGuard({ tool: "Bash", command: "node -e 'fs.appendFileSync(p, d)' # ~/.fuse-harness/cache/x.json" })?.kind).toBe("ask");
});

test("safe-path boundary: ~/.claude/logs allowed but ~/.claude/logs2-x is not", () => {
  expect(bashWriteGuard({ tool: "Bash", command: "echo x >> ~/.claude/logs/app.log" })).toBeNull();
  expect(bashWriteGuard({ tool: "Bash", command: "echo x > ~/.claude/logs2-x/f.log" })?.kind).toBe("ask");
});

test("tilde prefix ~user is not expanded into a bogus safe home", () => {
  // `~user`/`~2xyz` are login-name forms — never $HOME-relative, so never safe.
  expect(bashWriteGuard({ tool: "Bash", command: "echo x > ~user/.fuse-harness/cache/x" })?.kind).toBe("ask");
});

// CODE_MUTATORS `patch` motif: the command token, NOT the bare word in a path/arg.

test("does NOT block a read-only command merely NAMING a path with 'patch'", () => {
  // Regression: `\bpatch\b` false-matched these (jq is not a SAFE_PREFIX, so it reaches CODE_MUTATORS).
  expect(bashWriteGuard({ tool: "Bash", command: "jq . scenarios/22-codex-apply-patch-solid-deny.json" })).toBeNull();
  expect(bashWriteGuard({ tool: "Bash", command: "cat notes/apply-patch.md" })).toBeNull();
  expect(bashWriteGuard({ tool: "Bash", command: "echo running patch tests && ls" })).toBeNull();
});

test("blocks a real `patch` command invocation (start of command or after a `;` separator)", () => {
  expect(bashWriteGuard({ tool: "Bash", command: "patch -p1 < changes.diff" })?.kind).toBe("block");
  expect(bashWriteGuard({ tool: "Bash", command: "echo applying; patch -p1 < changes.diff" })?.kind).toBe("block");
});

// env-prefix / wrapper bypass closure: CMD-anchored motifs fire behind a
// transparent wrapper but ignore a quoted/argument mention (bash-command-anchor.ts).

test("blocks a code mutator behind a transparent wrapper (env / timeout / env VAR=)", () => {
  expect(bashWriteGuard({ tool: "Bash", command: "env sed -i 's/x/y/' src/foo.ts" })?.kind).toBe("block");
  expect(bashWriteGuard({ tool: "Bash", command: "timeout 5 patch -p1 < changes.diff" })?.kind).toBe("block");
  expect(bashWriteGuard({ tool: "Bash", command: "env FOO=bar patch < d.diff" })?.kind).toBe("block");
});

test("blocks tee/dd into a code file — behind a safe prefix, and past a decoy target", () => {
  expect(bashWriteGuard({ tool: "Bash", command: "cp a b; tee src/x.ts" })?.kind).toBe("block");
  expect(bashWriteGuard({ tool: "Bash", command: "echo x | tee log.txt src/x.ts" })?.kind).toBe("block");
  expect(bashWriteGuard({ tool: "Bash", command: "dd if=/dev/zero of=src/y.ts" })?.kind).toBe("block");
});

test("does NOT deny a mutator token quoted or in an argument (not a command position)", () => {
  expect(bashWriteGuard({ tool: "Bash", command: "git commit -m \"fix sed -i doc\"" })).toBeNull();
  expect(bashWriteGuard({ tool: "Bash", command: "npm run test -- --grep \"sed -i\"" })).toBeNull();
  expect(bashWriteGuard({ tool: "Bash", command: "echo 'patch file'" })).toBeNull();
});

test("does NOT block a tee to a non-code target, nor a plain cp (legit flows preserved)", () => {
  expect(bashWriteGuard({ tool: "Bash", command: "bun test | tee results.txt" })).toBeNull();
  expect(bashWriteGuard({ tool: "Bash", command: "cp src/a.ts src/b.ts" })).toBeNull();
});

test("wrapper-arg chain resolves fast to a non-match (no ReDoS backtracking)", () => {
  // A long run of flag-like wrapper args with no mutator must stay linear.
  const cmd = "env " + "--flag ".repeat(40) + "ls src";
  const started = Date.now();
  expect(bashWriteGuard({ tool: "Bash", command: cmd })).toBeNull();
  expect(Date.now() - started).toBeLessThan(1000);
});
