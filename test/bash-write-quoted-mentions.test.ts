import { test, expect } from "bun:test";
import { bashWriteGuard } from "../src/policy/guards/bash-write";
import type { GuardContext } from "../src/policy/guards/context";

/**
 * Challenger-measured defect (2026-09-05, main vs working tree): the CMD
 * anchor's `[\n;&|(]` separator alternation matches a separator INSIDE a
 * quoted argument, so the inline-script anchors (INLINE_JS_ANCHOR,
 * INLINE_JS_STDIN_ANCHOR, RUBY_E_ANCHOR, PERL_E_ANCHOR) fired on a pure
 * quoted MENTION of a write command. Fixed by testing those four anchors on
 * `unquotedShellText(cmd)` (bash-write-unquoted.ts) via `anchorText` instead
 * of raw `cmd` — see bash-write.ts.
 *
 * `null` below means "no Prompt returned" (allow).
 */
const cmd = (command: string): GuardContext => ({ tool: "Bash", command });
type Verdict = "block" | "ask" | null;
const verdict = (command: string): Verdict => (bashWriteGuard(cmd(command))?.kind as Verdict) ?? null;

// --- (a) Quoted mentions match main's exact verdict --------------------------

const MENTION_TABLE: readonly (readonly [string, Verdict])[] = [
  [`git commit -m "feat(guards): anchor ruby -e; ruby -e File.write to src/x.ts now blocks"`, null],
  [`git log --grep "; node -e writeFileSync src/x.ts"`, null],
  [`cat CHANGELOG.md | grep "; ruby -e File.write src/x.ts"`, null],
  [String.raw`grep -rn "\| node -e writeFileSync .*\.ts" docs/`, null],
  [String.raw`echo "(ruby -e 'File.write(\"src/x.ts\")')"`, "ask"],
  [`rg -n "; ruby -e File.write" docs/`, null],
];

test("(a) quoted mentions match main's exact verdict", () => {
  for (const [command, expected] of MENTION_TABLE) {
    expect(verdict(command)).toBe(expected);
  }
});

// --- (b) Real invocations still block/ask -------------------------------------

test("(b) bun -e writing a code file still blocks", () => {
  expect(verdict(`bun -e 'require("fs").writeFileSync("src/x.ts","1")'`)).toBe("block");
});

test("(b) ruby -ryaml -e writing a code file still blocks", () => {
  expect(verdict(`ruby -ryaml -e 'File.write("src/x.ts","1")'`)).toBe("block");
});

test("(b) perl -E opening a code file for write still blocks", () => {
  expect(verdict(`perl -E 'open(F,">","src/x.ts")'`)).toBe("block");
});

test("(b) bun - heredoc writing a code file still blocks", () => {
  const command = "bun - <<'EOF'\nrequire(\"fs\").writeFileSync(\"src/x.ts\",\"1\")\nEOF";
  expect(verdict(command)).toBe("block");
});

test("(b) NEW: ruby - heredoc writing a code file now blocks", () => {
  const command = "ruby - <<'EOF'\nFile.write(\"src/x.ts\",\"1\")\nEOF";
  expect(verdict(command)).toBe("block");
});

test("(b) FOO=1 bun -e writing a code file still blocks", () => {
  expect(verdict(`FOO=1 bun -e 'require("fs").writeFileSync("src/x.ts","1")'`)).toBe("block");
});

test("(b) mkdir -p d && bun -e writing under d still blocks", () => {
  expect(verdict(`mkdir -p d && bun -e 'require("fs").writeFileSync("d/big.ts","1")'`)).toBe("block");
});

test("(b) separator OUTSIDE quotes (git add . && bun -e ...) still blocks", () => {
  expect(verdict(`git add . && bun -e 'require("fs").writeFileSync("src/x.ts","1")'`)).toBe("block");
});

// --- (d) Nested ask tier unchanged --------------------------------------------

test("(d) node -e write nested in ssh (quoted) still asks", () => {
  const command = String.raw`ssh host "node -e 'require(\"fs\").writeFileSync(\"src/x.ts\",\"1\")'"`;
  expect(verdict(command)).toBe("ask");
});

test("(d) node -e with no write API nested in docker run still allows", () => {
  expect(verdict(`docker run image node -e 'console.log(1)'`)).toBeNull();
});

// --- (e) Command substitution / backtick expansion inside double quotes ------
//
// Challenger-measured defect (2026-09-05): stripQuoted used to strip the
// WHOLE content of a double-quoted segment, including a live `$(...)` or
// backtick expansion — but double quotes never suppress `$(...)`/backtick
// EXECUTION (POSIX Shell Command Language §2.2.3/§2.6.3; bash manual
// §3.1.2.3), only word-splitting/globbing of the result. A real invocation
// hiding behind `"$(bun -e '...')"` therefore read as an inert quoted
// MENTION and fell through to allow. Fixed: stripQuoted now copies a
// `$(...)`/backtick span through verbatim while still dropping ordinary
// double-quoted text around it — see bash-write-quotes.ts.

test("(e) $(...) bun command substitution hiding a code write now blocks", () => {
  expect(verdict(`echo "$(bun -e 'require("fs").writeFileSync("src/x.ts","1")')"`)).toBe("block");
});

test("(e) $(...) ruby command substitution hiding a code write now blocks", () => {
  expect(verdict(`X="$(ruby -e 'File.write("src/x.ts","1")')"`)).toBe("block");
});

// FIXED (bash-command-anchor.ts): CMD's separator class now includes a
// backtick, closing the gap where a bare backtick expansion (inside or
// outside quotes) was invisible to the command-position anchor.
test("(e) bare backtick expansion hiding a code write now blocks", () => {
  expect(verdict(`echo "\`bun -e 'require("fs").writeFileSync("src/x.ts","1")'\`"`)).toBe("block");
});

test("(g) bare backtick command substitution (no surrounding quotes) hiding a bun write blocks", () => {
  expect(verdict(`echo \`bun -e 'require("fs").writeFileSync("src/x.ts","1")'\``)).toBe("block");
});

test("(g) bare backtick command substitution hiding a ruby write blocks", () => {
  expect(verdict(`X=\`ruby -e 'File.write("src/x.ts","1")'\``)).toBe("block");
});

test("(g) bare backtick expansion of a harmless command still allows", () => {
  expect(verdict("echo `date`")).toBeNull();
});

// Rank increase, not a regression: main returns null here (no stripQuoted at
// all — CODE_MUTATORS ran on raw cmd against main's `[\n;&|(]` anchor, which
// never matched a backtick). Working tree now blocks: a backtick inside
// double quotes IS executed by the shell (POSIX Shell Command Language
// §2.2.3), so treating it as a command position is intended widening, not a
// false positive.
test("(g) git commit message quoting a sed -i command via backtick: main=null, working tree=block (intended widening)", () => {
  expect(verdict('git commit -m "see `sed -i x src/a.ts` note"')).toBe("block");
});

test("(e) witness: escaped-quote mention of bun -e/writeFileSync still allows", () => {
  expect(verdict(String.raw`git commit -m "say \"; bun -e writeFileSync src/x.ts\" ok"`)).toBeNull();
});
