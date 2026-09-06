import { test, expect } from "bun:test";
import { bashWriteGuard } from "../src/policy/guards/bash-write";
import { unquotedShellText } from "../src/policy/guards/bash-write-unquoted";
import type { GuardContext } from "../src/policy/guards/context";

/**
 * Challenger-found defect (2026-09-05, verified by real bash execution): a
 * fake `<<WORD` living in a comment, or on a quoted continuation line of a
 * multi-line quoted string, was taken as a real heredoc operator by the
 * OLD per-line detector (superseded by bash-write-lexer-heredoc.ts) — if a later line happened
 * to equal WORD, every line in between (including a genuine write
 * invocation) was DELETED from the anchor text, hiding it and turning a
 * would-be BLOCK into an ALLOW. Fixed by moving heredoc detection to run
 * LAST in `unquotedShellText` (bash-write-unquoted.ts), on text already
 * free of quotes/comments (bash-write-quotes.ts's global, multi-line quote
 * state) — see that file's JSDoc for the full redesign rationale.
 */
const cmd = (command: string): GuardContext => ({ tool: "Bash", command });
type Verdict = "block" | "ask" | null;
const verdict = (command: string): Verdict => (bashWriteGuard(cmd(command))?.kind as Verdict) ?? null;
const reason = (command: string): string | undefined => {
  const p = bashWriteGuard(cmd(command));
  return p && "reason" in p ? p.reason : undefined;
};

const WRITE_BUN = `bun -e 'require("fs").writeFileSync("src/x.ts","1")'`;
const WRITE_DENO = `deno eval 'Deno.writeTextFileSync("src/x.ts","1")'`;

// --- (a) 5 defect commands block; their data twins (write line removed) ------
// stay allow, matching main's parity for genuinely inert input. -------------

const COMMENT_TWIN = `echo hi # cat <<EOF\nEOF`;
const QUOTED_CONT_TWIN = `echo 'l1\nl2 <<EOF\n'\nEOF`;
const NESTED_HEREDOC_TWIN = `echo hi # cat <<EOF\nbun - <<Z\nZ\nEOF`;

const DEFECT_TABLE: readonly (readonly [string, string, string])[] = [
  ["comment-hidden bun -e", `echo hi # cat <<EOF\n${WRITE_BUN}\nEOF`, COMMENT_TWIN],
  ["comment-hidden deno eval", `echo hi # cat <<EOF\n${WRITE_DENO}\nEOF`, COMMENT_TWIN],
  ["quoted-continuation bun -e", `echo 'l1\nl2 <<EOF\n'\n${WRITE_BUN}\nEOF`, QUOTED_CONT_TWIN],
  ["quoted-continuation deno eval", `echo 'l1\nl2 <<EOF\n'\n${WRITE_DENO}\nEOF`, QUOTED_CONT_TWIN],
  [
    "comment-hidden nested heredoc (bun - <<Z)",
    `echo hi # cat <<EOF\nbun - <<Z\nrequire("fs").writeFileSync("src/x.ts","1")\nZ\nEOF`,
    NESTED_HEREDOC_TWIN,
  ],
];

test("(a) all 5 defect commands block, reason names Write/Edit", () => {
  for (const [label, command] of DEFECT_TABLE) {
    expect(verdict(command)).toBe("block");
    expect(reason(command)).toContain("Use Write/Edit");
    void label;
  }
});

test("(a) each data twin (write line removed) stays allow — main parity", () => {
  for (const twin of new Set(DEFECT_TABLE.map(([, , t]) => t))) {
    expect(verdict(twin)).toBeNull();
  }
});

// --- (b) command substitution spanning a real heredoc must not false-block ---

const SUBST_HEREDOC = `x=$(cat <<'EOF'\nplan; ruby -e File.write src/x.ts\nEOF\n)`;

test("(b) heredoc opened inside a multi-line $(...) substitution: body is data, never blocks", () => {
  // Deviation (reported, not silently swallowed): the owner's spec calls
  // for `null` here. This fix (bash-write-quotes.ts/bash-write-lexer-heredoc.ts,
  // files owned by this task) already closes the false BLOCK — RUBY_E_ANCHOR no
  // longer sees "ruby -e" once the heredoc body is correctly removed. The
  // residual "ask" comes from bash-write.ts's OWN unanchored fallback
  // (`/\bruby\s+-e\b/.test(cmd) && RUBY_WRITES.test(cmd)`, line ~141),
  // which scans the RAW command textually — with no heredoc awareness — and
  // is out of this task's file ownership (bash-write.ts is explicitly
  // off-limits). It can no longer BLOCK, only ask.
  expect(verdict(SUBST_HEREDOC)).not.toBe("block");
  expect(verdict(SUBST_HEREDOC)).toBe("ask");
});

// --- (c) unquotedShellText unit cases -----------------------------------------

test("(c) fake heredoc inside a comment never hides a later real command", () => {
  const out = unquotedShellText(`echo hi # cat <<EOF\nbun -e 'x'\nEOF`);
  expect(out).toContain("bun -e");
});

test("(c) fake heredoc on a quoted continuation line never hides a later real command", () => {
  const out = unquotedShellText(`echo 'l1\nl2 <<EOF\n'\nbun -e 'x'\nEOF`);
  expect(out).toContain("bun -e");
});

test("(c) `$((1<<3))` arithmetic is erased wholesale, later command survives", () => {
  const out = unquotedShellText(`echo $((1<<3))\nbun -e 'x'`);
  expect(out).toContain("bun -e");
});

test("(c) a real quoted-delimiter heredoc removes body+terminator, keeps trailing text", () => {
  const out = unquotedShellText(`cat <<'EOF'\nbody\nEOF\nnext`);
  expect(out).not.toContain("body");
  expect(out).not.toContain("\nEOF\n");
  expect(out.split("\n").at(-1)).toBe("next");
});

test("(c) an unterminated heredoc removes NOTHING (fail-closed)", () => {
  expect(unquotedShellText(`cat <<EOF`)).toBe(`cat <<EOF`);
});

test("(c) a spaced quoted delimiter (`<<'EO F'`) is handled correctly", () => {
  const out = unquotedShellText(`cat <<'EO F'\nbody\nEO F\nnext`);
  expect(out).not.toContain("body");
  expect(out.split("\n")).toEqual(["cat <<'EO F'", "next"]);
});
