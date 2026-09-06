import { test, expect } from "bun:test";
import { bashWriteGuard } from "../src/policy/guards/bash-write";
import type { GuardContext } from "../src/policy/guards/context";

/**
 * `python3 -c` content-gated write detection (bash-write-patterns.ts
 * PYTHON_C_ANCHOR + PYTHON_WRITES), aligned with the existing NODE_WRITES /
 * RUBY_WRITES pattern in bash-write.ts. See bash-write.ts:37-42 for the block
 * site and bash-write-patterns.ts for the pattern definitions.
 */

const cmd = (command: string): GuardContext => ({ tool: "Bash", command });

// Must stay BLOCKED — real mutation / process spawn behind `python3 -c`.

test("blocks python3 -c open(...,'w').write(...)", () => {
  expect(bashWriteGuard(cmd("python3 -c \"open('x.ts','w').write('bad')\""))?.kind).toBe("block");
});

test("blocks python3 -c os.remove", () => {
  expect(bashWriteGuard(cmd("python3 -c \"import os; os.remove('x.ts')\""))?.kind).toBe("block");
});

test("blocks python3 -c subprocess.run", () => {
  expect(bashWriteGuard(cmd("python3 -c \"import subprocess; subprocess.run(['rm','-rf','/'])\""))?.kind).toBe("block");
});

test("blocks python3 -c shutil.rmtree", () => {
  expect(bashWriteGuard(cmd("python3 -c \"import shutil; shutil.rmtree('src')\""))?.kind).toBe("block");
});

test("blocks python3 -c Path(...).write_text(...)", () => {
  expect(bashWriteGuard(cmd("python3 -c \"from pathlib import Path; Path('x.ts').write_text('bad')\""))?.kind).toBe("block");
});

test("blocks python3 heredoc unconditionally (content not inspected)", () => {
  expect(bashWriteGuard(cmd("python3 - <<EOF\nprint(1)\nEOF"))?.kind).toBe("block");
});

test("blocks python3 -c json.dump (the writing form)", () => {
  expect(bashWriteGuard(cmd("python3 -c \"import json; json.dump(d, open('f','w'))\""))?.kind).toBe("block");
});

// Must PASS — read-only inline scripts.

test("passes python3 -c print", () => {
  expect(bashWriteGuard(cmd("python3 -c \"print(1)\""))).toBeNull();
});

test("passes python3 -c json.load", () => {
  expect(bashWriteGuard(cmd("python3 -c \"import json; print(json.load(open('f'))['x'])\""))).toBeNull();
});

test("passes python3 -c json.dumps (serialize only, no I/O)", () => {
  expect(bashWriteGuard(cmd("python3 -c \"import json; print(json.dumps(d))\""))).toBeNull();
});

// Non-regression — node/ruby -e verdicts, and the other write-detection paths,
// must be strictly unchanged by the python content-gate addition.

test("non-regression: node -e read-only vs write", () => {
  expect(bashWriteGuard(cmd("node -e \"console.log(1)\""))).toBeNull();
  // 2026-09-05 owner decision: inline-script write to a CODE file is a block (was ask), parity with shell redirects.
  expect(bashWriteGuard(cmd("node -e \"fs.writeFileSync('x.ts','bad')\""))?.kind).toBe("block");
});

test("non-regression: ruby -e read-only vs write", () => {
  expect(bashWriteGuard(cmd("ruby -e \"puts 1\""))).toBeNull();
  // 2026-09-05 owner decision: inline-script write to a CODE file is a block (was ask), parity with shell redirects.
  expect(bashWriteGuard(cmd("ruby -e \"File.write('x.ts','bad')\""))?.kind).toBe("block");
});

test("non-regression: sed/perl/awk/patch/tee-to-code stay blocked", () => {
  expect(bashWriteGuard(cmd("sed -i 's/a/b/' src/x.ts"))?.kind).toBe("block");
  expect(bashWriteGuard(cmd("perl -pi -e 's/a/b/' src/x.ts"))?.kind).toBe("block");
  expect(bashWriteGuard(cmd("awk -i inplace '{print}' src/x.ts"))?.kind).toBe("block");
  expect(bashWriteGuard(cmd("patch -p1 < changes.diff"))?.kind).toBe("block");
  expect(bashWriteGuard(cmd("echo x > src/y.ts"))?.kind).toBe("block");
  expect(bashWriteGuard(cmd("echo x | tee src/z.ts"))?.kind).toBe("block");
});

// Falsifiability witness: PYTHON_WRITES is what blocks the write cases, not
// PYTHON_C_ANCHOR alone or some other guard branch. Mutating PYTHON_WRITES to
// never-match (via a fresh, deliberately-unmatchable regex import path is not
// exercised here — see report §6 for the manual toggle evidence) would flip
// these to null; this test instead pins the anchor-only case to prove the
// anchor by itself does not block a read-only script.
test("anchor alone (no write content) does not block — proves the AND-gate, not just the anchor", () => {
  expect(bashWriteGuard(cmd("python3 -c \"x = 1 + 1\""))).toBeNull();
});

// The reported grep false positive (mandate case 3) IS fixed, but only as a
// side effect of content-gating, not because the anchor's quoting blindness
// was corrected. PYTHON_C_ANCHOR still mis-reads the `|` inside the quoted
// grep pattern as a command separator (verified true below by importing the
// anchor directly) — it is PYTHON_WRITES failing to match this specific
// string's content (no write-indicating token) that keeps the verdict at
// null. A grep pattern string that happens to ALSO contain write-indicating
// text after the `|` would still false-block; that residual gap is real and
// is NOT fixable without quote-aware tokenization (see bash-command-anchor.ts
// residual-gaps doc comment) — documented here, not silently assumed fixed.
test("grep for the literal pattern string now passes (content-gate side effect, anchor bug remains)", () => {
  expect(bashWriteGuard(cmd(String.raw`grep -rn "inline script\|python3 -c\|python.*-c" src/policy`))).toBeNull();
});

test("KNOWN RESIDUAL LIMITATION: a quoted grep pattern that ALSO contains write-indicating text still false-blocks", () => {
  // Same quoting bug as above, but this time the anchor's false match is
  // followed by content that legitimately matches PYTHON_WRITES (os.remove),
  // even though it's still just a string literal inside `grep`'s pattern arg.
  const result = bashWriteGuard(cmd(String.raw`grep -rn "a|python3 -c os.remove(x)" src/policy`));
  expect(result?.kind).toBe("block");
});
