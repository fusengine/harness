import { test, expect } from "bun:test";
import { bashWriteGuard } from "../src/policy/guards/bash-write";
import type { GuardContext } from "../src/policy/guards/context";

/**
 * Challenger-measured bypass closures (2026-09-05): stdin-piped inline
 * scripts (bypass #1, INLINE_JS_STDIN_ANCHOR), the safe-path-disarms-block
 * reorder (bypass #2, inlineScriptVerdict in bash-write.ts), the env-var
 * prefix at command position 0 (bypass #4, ENV_PREFIX in
 * bash-command-anchor.ts), and `perl -e` writes (bypass #8, PERL_E_ANCHOR +
 * PERL_WRITES).
 */

const cmd = (command: string): GuardContext => ({ tool: "Bash", command });

// Bypass #1: `<runtime> -` stdin script, heredoc/pipe body inspected like `-e`.

test("bypass #1: bun - heredoc writing a code file now blocks (was allow)", () => {
  const command = "bun - <<'EOF'\nrequire(\"fs\").writeFileSync(\"src/x.ts\",\"1\")\nEOF";
  expect(bashWriteGuard(cmd(command))?.kind).toBe("block");
});

test("bypass #1: node - heredoc writing a code file blocks", () => {
  const command = "node - <<EOF\nrequire(\"fs\").writeFileSync(\"src/x.ts\",\"1\")\nEOF";
  expect(bashWriteGuard(cmd(command))?.kind).toBe("block");
});

test("bypass #1: bun run - heredoc writing a code file blocks", () => {
  const command = "bun run - <<EOF\nrequire(\"fs\").writeFileSync(\"src/x.ts\",\"1\")\nEOF";
  expect(bashWriteGuard(cmd(command))?.kind).toBe("block");
});

test("bypass #1: echo | node - writing a code file blocks", () => {
  expect(bashWriteGuard(cmd('echo \'require("fs").writeFileSync("src/x.ts","1")\' | node -'))?.kind).toBe("block");
});

test("bypass #1: printf | bun - writing a code file blocks", () => {
  expect(bashWriteGuard(cmd('printf \'require("fs").writeFileSync("src/x.ts","1")\' | bun -'))?.kind).toBe("block");
});

test("bypass #1: deno run -A - writing a code file blocks", () => {
  const command = "deno run -A - <<EOF\nawait Deno.writeTextFile(\"src/x.ts\",\"1\")\nEOF";
  expect(bashWriteGuard(cmd(command))?.kind).toBe("block");
});

test("witness: bun - heredoc with no write API stays allow", () => {
  expect(bashWriteGuard(cmd("bun - <<'EOF'\nconsole.log(1)\nEOF"))).toBeNull();
});

test("witness: node - heredoc writing a non-code file still asks", () => {
  const command = "node - <<EOF\nrequire(\"fs\").writeFileSync(\"out.json\",\"1\")\nEOF";
  expect(bashWriteGuard(cmd(command))?.kind).toBe("ask");
});

test("inherent gap (documented, not attempted): `cat file.js | node -` has no visible write API", () => {
  // The actual script lives off-command in file.js — unpoliceable by a static
  // regex over the command line, equivalent to `node file.js`.
  expect(bashWriteGuard(cmd("cat file.js | node -"))).toBeNull();
});

// Bypass #2: code-file block runs BEFORE the safe-path allow short-circuit.

test("bypass #2: an earlier safe-path literal no longer disarms a later code-file write", () => {
  const command = 'bun -e \'appendFileSync("~/.fuse-harness/cache/a.json");writeFileSync("src/x.ts")\'';
  expect(bashWriteGuard(cmd(command))?.kind).toBe("block");
});

test("non-regression: a lone safe-path write with no code-file target still allows", () => {
  const command = 'bun -e \'appendFileSync("~/.fuse-harness/cache/a.json","1")\'';
  expect(bashWriteGuard(cmd(command))).toBeNull();
});

// Bypass #4: leading `VAR=value` assignment at command position 0.

test("bypass #4: BUN_X=1 bun -e writing a code file now blocks (was allow)", () => {
  const command = 'BUN_X=1 bun -e \'require("fs").writeFileSync("src/x.ts","1")\'';
  expect(bashWriteGuard(cmd(command))?.kind).toBe("block");
});

test("bypass #4: FOO=1 sed -i on a code file now blocks (was allow)", () => {
  expect(bashWriteGuard(cmd("FOO=1 sed -i x src/a.ts"))?.kind).toBe("block");
});

test("witness: FOO=1 grep on a code file still allows (read-only)", () => {
  expect(bashWriteGuard(cmd("FOO=1 grep x src/a.ts"))).toBeNull();
});

test("witness: FOO=1 bun -e with no write API still allows", () => {
  expect(bashWriteGuard(cmd("FOO=1 bun -e 'console.log(1)'"))).toBeNull();
});

// Bypass #8: `perl -e` inline-script writes (parity ruby -e / JS -e).

test("bypass #8: perl -e writing a code file now blocks (was allow)", () => {
  expect(bashWriteGuard(cmd("perl -e \"open(FH,'>','x.ts'); print FH 1;\""))?.kind).toBe("block");
});

test("witness: perl -e with no write API still allows", () => {
  expect(bashWriteGuard(cmd("perl -e 'print 1'"))).toBeNull();
});

test("non-regression: existing perl -pi in-place edit still blocks via CODE_MUTATORS", () => {
  expect(bashWriteGuard(cmd("perl -pi -e 's/a/b/' src/x.ts"))?.kind).toBe("block");
});
