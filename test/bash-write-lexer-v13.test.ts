import { test, expect } from "bun:test";
import { bashWriteGuard } from "../src/policy/guards/bash-write";
import { anchorText } from "../src/policy/guards/bash-write-lexer";
import { unquotedShellText } from "../src/policy/guards/bash-write-unquoted";
import type { GuardContext } from "../src/policy/guards/context";

/**
 * v13 coverage for the `$(...)`-close-vs-grouping-`)` defect in
 * {@link anchorText} (bash-write-lexer.ts): `WORD_BREAK` treated ANY `)` as
 * ending a word, so a following `#` was always read as a comment start —
 * even when the `)` closed a `$(...)` command substitution, which splices
 * its result into the surrounding word instead (POSIX §2.3 rule 9). Real
 * bash: `echo $(true)#; bun -e '...'` runs BOTH commands; the guard used to
 * read everything after `#` as a dropped comment and let the write through.
 */
const cmd = (command: string): GuardContext => ({ tool: "Bash", command });
type Verdict = "block" | "ask" | null;
const verdict = (command: string): Verdict => (bashWriteGuard(cmd(command))?.kind as Verdict) ?? null;
const reason = (command: string): string | undefined => bashWriteGuard(cmd(command))?.reason;

const WRITE_BUN = `bun -e 'require("fs").writeFileSync("src/x.ts","1")'`;
const WRITE_RUBY = `ruby -e 'File.write("src/x.ts","1")'`;
const WRITE_DENO = `deno eval 'Deno.writeTextFileSync("src/x.ts","1")'`;

// --- x_ fixtures: every one MUST block, real bash writes while the old
// guard allowed (measured before this fix) --------------------------------

const MUST_BLOCK: Readonly<Record<string, string>> = {
  x_subst_hash_bun: `echo $(true)#; ${WRITE_BUN}`,
  x_nested_subst_hash_bun: `echo $(echo $(true))#; ${WRITE_BUN}`,
  x_assign_subst_hash_deno: `x=$(date)#; ${WRITE_DENO}`,
  x_subst_hash_ruby: `echo $(true)#; ${WRITE_RUBY}`,
  // a plain GROUPING `(...)` nesting validly inside `$(...)` (e.g. `$(a;
  // (b))`) must not pop `parenDepth` back to 0 on the inner `)` — that
  // would misread the substitution's REAL close as a grouping close and
  // hide the write behind a phony comment (measured: was `null` pre-fix).
  x_nested_grouping_in_subst_hash_bun: `echo $(a (b) c)#; ${WRITE_BUN}`,
};

test("(x) every x_ fixture blocks with a Use Write/Edit reason", () => {
  for (const [name, command] of Object.entries(MUST_BLOCK)) {
    expect([name, verdict(command)]).toEqual([name, "block"]);
    expect([name, reason(command)]).toEqual([name, expect.stringContaining("Use Write/Edit")]);
  }
});

// --- d_ fixtures: must equal main's measured verdict (parity) -------------
// group_paren_write measured on main-wt (untouched checkout): null — a
// GROUPING `)` still starts a real comment (write hidden), exactly as
// before this fix; this test only guards against a REGRESSION here.

const PARITY: readonly (readonly [string, string, Verdict])[] = [
  ["group_paren_write", `(echo a)#; ${WRITE_BUN}`, null],
  ["space_before_hash_subst", `echo $(true) #; ${WRITE_BUN}`, null],
  ["space_before_hash_arith", `echo $((1)) #; ${WRITE_BUN}`, null],
  ["ls_comment_ruby", `ls -la # ; ${WRITE_RUBY}`, null],
  ["subst_alone", `echo $(true)`, null],
  ["subshell_cd_ls", `(cd a && ls)`, null],
];

test("(d) parity fixtures match the hardcoded owner-measured verdict", () => {
  for (const [name, command, expected] of PARITY) {
    expect([name, verdict(command)]).toEqual([name, expected]);
  }
});

// --- anchorText unit cases -------------------------------------------------

test("(unit) '$(true)' closing paren is mid-word: '#x' after it is NOT a comment", () => {
  expect(anchorText("echo $(true)#x")).toContain("#x");
});

test("(unit) a GROUPING '(echo a)' closing paren ends the word: '#x' IS a comment", () => {
  expect(anchorText("(echo a)#x")).not.toContain("#x");
});

test("(unit) nested command substitutions stay mid-word through both closes", () => {
  expect(anchorText("echo $(a $(b))#x")).toContain("#x");
});

test("(unit) a plain GROUPING '(' nested inside '$(...)' also stays mid-word", () => {
  expect(anchorText("echo $(a (b) c)#x")).toContain("#x");
});

test("(unit) a top-level GROUPING '(...)' containing '$(...)' still ends the word", () => {
  expect(anchorText("(a $(b))#x")).not.toContain("#x");
});

test("(unit) an unterminated '$(true' fails closed: raw remainder is present", () => {
  expect(anchorText("echo $(true")).toContain("true");
});

// --- Perf -------------------------------------------------------------------

/**
 * Distinct-from-sibling-files seeded generator (xorshift32, not mulberry32
 * — avoids the DRY-guard collision with bash-write-lexer.test.ts /
 * bash-write-lexer-v12.test.ts, which each declare their own unexported
 * helper of the same shape) producing the mandate's malformed-token
 * alphabet.
 */
function xorshift32(seed: number): () => number {
  let state = seed;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
}

const TOKEN_ALPHABET = [
  "<<", "\n", "'", '"', "$((", "$(", ")", "`", "#", ";", "|", "bun -e ", "EOF", " ", "\\",
];

function buildMalformedInput(rng: () => number, length: number): string {
  let out = "";
  while (out.length < length) out += TOKEN_ALPHABET[Math.floor(rng() * TOKEN_ALPHABET.length)];
  return out.slice(0, length);
}

test("(perf) unquotedShellText worst-case: 20 malformed 2000-char inputs stay under 5ms each", () => {
  const rng = xorshift32(2026);
  for (let i = 0; i < 20; i++) {
    const input = buildMalformedInput(rng, 2000);
    const start = performance.now();
    unquotedShellText(input);
    expect(performance.now() - start).toBeLessThan(5);
  }
});

test("(perf) a 2000-deep '$($($(...' nesting does not throw or exceed 20ms", () => {
  const input = "$(".repeat(2000) + "true" + ")".repeat(2000);
  const start = performance.now();
  expect(() => anchorText(input)).not.toThrow();
  expect(performance.now() - start).toBeLessThan(20);
});
