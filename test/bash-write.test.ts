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
