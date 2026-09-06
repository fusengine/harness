import { test, expect } from "bun:test";
import { bashWriteGuard } from "../src/policy/guards/bash-write";
import { unquotedShellText } from "../src/policy/guards/bash-write-unquoted";
import { INLINE_JS_ANCHOR, INLINE_JS_STDIN_ANCHOR, RUBY_E_ANCHOR, PERL_E_ANCHOR } from "../src/policy/guards/bash-write-patterns";
import type { GuardContext } from "../src/policy/guards/context";

/**
 * Break-1 (any `<<` disarmed the anchors) and Break-2 (blanking heredoc
 * bodies into long `\n` runs made CMD's prefix quadratic) — owner-measured
 * 2026-09-05, fixed in bash-write-lexer-heredoc.ts (quote/arithmetic-aware
 * scan + fail-closed body removal) and bash-write-unquoted.ts (`collapseSeparators`).
 */
const cmd = (command: string): GuardContext => ({ tool: "Bash", command });
type Verdict = "block" | "ask" | null;
const verdict = (command: string): Verdict => (bashWriteGuard(cmd(command))?.kind as Verdict) ?? null;

const WRITE_BUN = `bun -e 'require("fs").writeFileSync("src/x.ts","1")'`;
const WRITE_RUBY = `ruby -e 'File.write("src/x.ts","1")'`;
const WRITE_DENO = `deno eval 'Deno.writeTextFileSync("src/x.ts","1")'`;

// --- (a) Break-1: a non-heredoc `<<` must never disarm a LATER real write ---

const BREAK1_TABLE: readonly (readonly [string, string])[] = [
  ["echo $((1<<3))", WRITE_BUN],
  ['git commit -m "doc <<EOF usage"', WRITE_BUN],
  ['grep -n "<<TOKEN" d.md', WRITE_BUN],
  ["echo 'cout << endl'", WRITE_BUN],
  ['echo "<<HD"', WRITE_DENO],
  ["echo $((1<<3))", WRITE_RUBY],
];

test("(a) real write on a later line still blocks despite an arithmetic/quoted `<<` earlier", () => {
  for (const [dataLine, writeLine] of BREAK1_TABLE) {
    expect(verdict(`${dataLine}\n${writeLine}`)).toBe("block");
  }
});

test("(a) each data line ALONE (no write line) stays allow — main parity", () => {
  for (const dataLine of new Set(BREAK1_TABLE.map(([line]) => line))) {
    expect(verdict(dataLine)).toBeNull();
  }
});

const CRLF_HEREDOC = "cat <<'EOF' | tee /dev/null\r\nd\r\nEOF\r";

test("(a) CRLF heredoc terminator (`EOF\\r`) still terminates — later write still blocks", () => {
  expect(verdict(`${CRLF_HEREDOC}\n${WRITE_BUN}`)).toBe("block");
});

test("(a) CRLF heredoc alone (no write line) stays allow", () => {
  expect(verdict(CRLF_HEREDOC)).toBeNull();
});

// --- (c) Real heredoc invocations still block --------------------------------

test("(c) two heredocs opened on the SAME line are both consumed, later write still blocks", () => {
  expect(verdict(`cat <<A <<B\na\nA\nb\nB\n${WRITE_BUN}`)).toBe("block");
});

test("(c) heredoc piped into `bun -` via `|` still blocks", () => {
  expect(verdict(`cat <<'EOF' | bun -\nrequire("fs").writeFileSync("src/x.ts","1")\nEOF`)).toBe("block");
});

test("(c) unterminated heredoc fails CLOSED — body stays visible, still blocks", () => {
  expect(verdict(`cat <<'EOF'\nx; ${WRITE_BUN}`)).toBe("block");
});

// --- (c) delimiter charset: `-`/`.` are legal per POSIX, not just `\w+` ------

test("(c) quoted delimiter with `-` is matched IN FULL — a bare 'EOF' body line does not prematurely close it", () => {
  expect(verdict(`cat <<'EOF-1'\nEOF\n${WRITE_BUN}\nEOF-1`)).toBeNull();
});

test("(c) bare delimiter with `.` is matched IN FULL, not truncated to its alnum prefix", () => {
  expect(verdict(`cat <<END.marker\nEND\n${WRITE_BUN}\nEND.marker`)).toBeNull();
});

test("(c) delimiter with `-` still blocks a write placed AFTER the real terminator", () => {
  expect(verdict(`cat <<'EOF-1'\nbody\nEOF-1\n${WRITE_BUN}`)).toBe("block");
});

// --- (d) Perf: linear time, no quadratic blowup on legitimate input ---------

test("(d) perf: 3000-line commit-body heredoc guard stays under 20ms", () => {
  const body = Array.from({ length: 3000 }, (_, i) => `line ${i} of the commit message body`).join("\n");
  const start = performance.now();
  bashWriteGuard(cmd(`git commit -F- <<'EOF'\n${body}\nEOF`));
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(20);
  console.log(`(d) 3000-line heredoc guard time: ${elapsed.toFixed(3)}ms`);
});

test("(d) perf: four anchors combined stay under 5ms on a 2000-newline run", () => {
  const unquoted = unquotedShellText("\n".repeat(2000));
  const start = performance.now();
  INLINE_JS_ANCHOR.test(unquoted);
  INLINE_JS_STDIN_ANCHOR.test(unquoted);
  RUBY_E_ANCHOR.test(unquoted);
  PERL_E_ANCHOR.test(unquoted);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(5);
  console.log(`(d) four-anchor combined time on 2000-newline run: ${elapsed.toFixed(3)}ms`);
});

/** Deterministic pseudo-random generator (mulberry32) — repeatable across
 *  runs so a flaky timing test never hides a real regression. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Alphabet deliberately includes `\n`, `<`, `'`, `"`, `$`, `(`, `` ` `` so
 *  random draws routinely compose `<<`, `$((`, and unbalanced quotes. */
const MALFORMED_ALPHABET = "ab$(<>'\"`\n\t;&|-";

function malformedInput(rng: () => number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += MALFORMED_ALPHABET[Math.floor(rng() * MALFORMED_ALPHABET.length)];
  }
  return out;
}

test("(d) perf: 20 malformed 2000-char heredoc/quote/arithmetic inputs stay under 5ms each", () => {
  const rng = mulberry32(1337);
  let max = 0;
  for (let i = 0; i < 20; i++) {
    const command = malformedInput(rng, 2000);
    const start = performance.now();
    bashWriteGuard(cmd(command));
    const elapsed = performance.now() - start;
    max = Math.max(max, elapsed);
    expect(elapsed).toBeLessThan(5);
  }
  console.log(`(d) max guard time over 20 malformed 2000-char inputs: ${max.toFixed(3)}ms`);
});
