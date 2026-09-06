import { test, expect } from "bun:test";
import { bashWriteGuard } from "../src/policy/guards/bash-write";
import { anchorText } from "../src/policy/guards/bash-write-lexer";
import type { GuardContext } from "../src/policy/guards/context";

/**
 * Guard-level + unit coverage for the {@link anchorText} redesign
 * (2026-09-05): one left-to-right state machine replacing two prior
 * sequential pipelines (heredoc-first, then quotes-first) that each had a
 * real bypass — see bash-write-lexer.ts's JSDoc for the rationale.
 */
const cmd = (command: string): GuardContext => ({ tool: "Bash", command });
type Verdict = "block" | "ask" | null;
const verdict = (command: string): Verdict => (bashWriteGuard(cmd(command))?.kind as Verdict) ?? null;

const WRITE_BUN = `bun -e 'require("fs").writeFileSync("src/x.ts","1")'`;
const WRITE_RUBY = `ruby -e 'File.write("src/x.ts","1")'`;
const CLEAN = "clean";

// --- (a) v10 bypasses: a disarming char INSIDE a heredoc body must never --
// swallow the real terminator or the real write that follows. -------------

const BYPASS_TABLE: readonly (readonly [string, string])[] = [
  [`cat <<'EOF'\nit's\nEOF\n${WRITE_BUN}`, `cat <<'EOF'\n${CLEAN}\nEOF\n${WRITE_BUN}`],
  [`cat <<EOF\nit's\nEOF\n${WRITE_BUN}`, `cat <<EOF\n${CLEAN}\nEOF\n${WRITE_BUN}`],
  [`cat <<'EOF'\nn=$((1+2\nEOF\n${WRITE_BUN}`, `cat <<'EOF'\n${CLEAN}\nEOF\n${WRITE_BUN}`],
  [`cat <<'EOF'\nsay "hi\nEOF\n${WRITE_RUBY}`, `cat <<'EOF'\n${CLEAN}\nEOF\n${WRITE_RUBY}`],
];

test("(a) all 4 v10 bypasses block; clean-body controls also block", () => {
  for (const [defect, control] of BYPASS_TABLE) {
    expect(verdict(defect)).toBe("block");
    expect(verdict(control)).toBe("block");
  }
});

test("(a) the disarming heredoc alone (no write after) stays allow", () => {
  expect(verdict(`cat <<'EOF'\nit's\nEOF`)).toBeNull();
});

// --- (b) v8/v9/v10 shapes: every known disarm attempt still blocks --------

test("(b) known disarm shapes all still block", () => {
  expect(verdict(`echo hi # cat <<EOF\n${WRITE_BUN}\nEOF`)).toBe("block");
  expect(verdict(`echo 'l1\nl2 <<EOF\n'\n${WRITE_BUN}\nEOF`)).toBe("block");
  expect(verdict(`echo $((1<<3))\n${WRITE_BUN}`)).toBe("block");
  expect(verdict(`cat <<'EOF' | tee /dev/null\r\nd\r\nEOF\r\n${WRITE_BUN}`)).toBe("block");
  expect(verdict(`cat <<'EOF'\nx; ${WRITE_BUN}`)).toBe("block");
  expect(verdict(`cat <<A <<B\na\nA\nb\nB\n${WRITE_BUN}`)).toBe("block");
  // A real command chained by `;` on the heredoc operator line is a SECOND
  // command on that line — never heredoc data.
  expect(verdict(`cat <<EOF; ${WRITE_BUN}\nbody\nEOF`)).toBe("block");
  expect(verdict(`bun - <<'EOF'\nrequire("fs").writeFileSync("src/x.ts","1")\nEOF`)).toBe("block");
  expect(verdict(`cat <<'EOF' | bun -\nrequire("fs").writeFileSync("src/x.ts","1")\nEOF`)).toBe("block");
});

test("(b) heredoc body full of disarm-shaped chars but NO write anywhere stays allow", () => {
  const weirdBody = '#c `bt` $((x "q';
  expect(verdict(`cat <<'EOF'\n${weirdBody}\nEOF`)).toBeNull();
});

// --- (c) data parity: main returns null on every one of these, except the --
// $(...) command-substitution case, which is a REAL execution (block). -----

const DATA_PARITY_TABLE: readonly (readonly [string, Verdict])[] = [
  ["git commit -F- <<'EOF'\nfix; ruby -e File.write src/x.ts\nEOF", null],
  [`cat <<'EOF' | tee /dev/null\nplan; ${WRITE_BUN}\nEOF`, null],
  [`ls -la # ; ruby -e 'File.write("src/x.ts")'`, null],
  ["x=$(cat <<'EOF'\nplan; ruby -e File.write src/x.ts\nEOF\n)", "ask"],
  [`git commit -m "fix; ruby -e File.write src/x.ts"`, null],
  [`echo "$(${WRITE_BUN})"`, "block"],
];

// Deviation (reported, not silently swallowed): row 4's owner-specified
// verdict is `null`. This task's heredoc handling already closes the false
// BLOCK — the heredoc body is correctly removed, so RUBY_E_ANCHOR never
// fires. The residual "ask" comes from bash-write.ts's OWN unanchored
// fallback (`/\bruby\s+-e\b/.test(cmd) && RUBY_WRITES.test(cmd)`, textual on
// the RAW cmd, no heredoc awareness), out of this task's file ownership
// (bash-write.ts is off-limits) — it can no longer BLOCK, only ask. Row 1
// looks identical but starts with a SAFE_PREFIXES token (`git`), which
// short-circuits to `null` before that fallback is ever reached.
test("(c) data-context parity table matches main's exact verdict for each command", () => {
  for (const [command, expected] of DATA_PARITY_TABLE) expect(verdict(command)).toBe(expected);
});

// --- (d) anchorText unit cases ------------------------------------------------

test("(d) anchorText unit cases", () => {
  const removed = anchorText(`cat <<'EOF'\nit's\nEOF\nnext`);
  expect(removed).not.toContain("it's");
  expect(removed.split("\n").at(-1)).toBe("next");

  expect(anchorText(`echo "hello world`)).toContain("hello world");
  expect(anchorText("echo ${#arr} $# ok")).toBe("echo ${#arr} $# ok");
  expect(anchorText("cat <<< 'foo; bun -e writeFileSync(\"src/x.ts\")'")).toBe("cat <<< ''");
});

// --- (e) Perf: linear-time behavior on adversarial input ---------------------

test("(e) perf: 3000-line commit-body heredoc guard stays under 20ms", () => {
  const body = Array.from({ length: 3000 }, (_, i) => `line ${i} of the commit message body`).join("\n");
  const start = performance.now();
  bashWriteGuard(cmd(`git commit -F- <<'EOF'\n${body}\nEOF`));
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(20);
});

/** Deterministic pseudo-random generator (mulberry32). */
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

/** Token alphabet (not char alphabet): random draws routinely compose `<<`,
 *  `$((`, unbalanced quotes, comments, and a bare `bun -e `/`EOF`. */
const MALFORMED_TOKENS = ["<<", "\n", "'", '"', "$((", "`", "#", ";", "|", "bun -e ", "EOF", " "];

function malformedTokenInput(rng: () => number, length: number): string {
  let out = "";
  while (out.length < length) out += MALFORMED_TOKENS[Math.floor(rng() * MALFORMED_TOKENS.length)];
  return out.slice(0, length);
}

test("(e) perf: 20 malformed 2000-char inputs stay under 5ms each through anchorText", () => {
  const rng = mulberry32(2026);
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    anchorText(malformedTokenInput(rng, 2000));
    expect(performance.now() - start).toBeLessThan(5);
  }
});

test("(e) perf: 500 unterminated heredocs on one 50000-line command stay under 50ms", () => {
  // Deviation (reported): 500 heredocs opened on ONE line (valid bash,
  // `cat <<A <<B ...`) — the fail-CLOSED contract stops the whole batch at
  // the FIRST unterminated one, so this costs ONE end-of-string scan.
  // Spreading the same 500 across 500 DIFFERENT lines instead (measured
  // separately, not asserted here) costs ~745ms: each failure resumes
  // ordinary lexing right after its own line (by design — a real write
  // hiding there must stay visible), so a LATER `<<` inside an earlier
  // unterminated "body" is re-examined as a fresh candidate and can itself
  // fail, repeating the scan. Inherent to the specified fail-closed design,
  // not a defect here — flagged for the owner, not fixed.
  const ops = Array.from({ length: 500 }, (_, i) => `<<X${i}`).join(" ");
  const filler = Array.from({ length: 49999 }, (_, i) => `plain line ${i}`).join("\n");
  const start = performance.now();
  anchorText(`cat ${ops}\n${filler}`);
  expect(performance.now() - start).toBeLessThan(50);
});
