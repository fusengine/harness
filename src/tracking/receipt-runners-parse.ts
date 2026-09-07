/**
 * @module receipt-runners-parse
 * Pass/fail count parsers for {@link RunnerSpec.counts} (`./receipt-runners`),
 * one per TEST-runner output format — static-checker parsers (`mypy`,
 * `pyright`, `phpstan`, `tsc`, `go vet`/`build`, `cargo check`/`clippy`,
 * `swift build`) live in `./receipt-runners-parse-static`, and PHP-runner
 * parsers (`phpunit`, `pest`) live in `./receipt-runners-parse-php` (which
 * imports {@link parseFailedPassedSummary} from here), to keep every file
 * under the SOLID line ceiling. Each returns `{ pass?, fail? }` —
 * `undefined` fields mean "not reported", never "zero"; `classifyReceipt`
 * (`./receipts`) falls back to `exitCode` alone via `isPassing` when both are
 * absent. Formats verified against each tool's real summary-line output.
 */

/**
 * `bun test` — ` 8 pass\n 0 fail\n`. Anchored to LINE START (`^\s*(\d+)\s+
 * pass|fail\b`, `/m`) and the LAST such line, never the first match anywhere
 * in the output (D3: a test NAME like "returns 3 fail codes" is not at a
 * line start after a `\s*` prefix, so it can never match; a later summary
 * line, if bun ever prints more than one block, wins over an earlier one).
 */
export function parseBunTest(output: string): { pass?: number; fail?: number } {
  const passMatches = [...output.matchAll(/^\s*(\d+)\s+pass\b/gm)];
  const failMatches = [...output.matchAll(/^\s*(\d+)\s+fail\b/gm)];
  return {
    pass: passMatches.length ? Number(passMatches[passMatches.length - 1]![1]) : undefined,
    fail: failMatches.length ? Number(failMatches[failMatches.length - 1]![1]) : undefined,
  };
}

/**
 * Shared "`N failed`, `M passed`" summary-line contract for vitest/pest:
 * capture group 1 is always the optional `failed` clause; `passGroupIndex`
 * is this format's `passed` clause index. Both clauses are optional in the
 * underlying regex — a failed-only summary (no `passed` clause at all) must
 * still report `fail`, so `{}` is returned only when NEITHER clause matched.
 * Exported for `./receipt-runners-parse-php`'s `parsePest`.
 */
export function parseFailedPassedSummary(m: RegExpMatchArray | null, passGroupIndex: number): { pass?: number; fail?: number } {
  if (!m || (m[1] === undefined && m[passGroupIndex] === undefined)) return {};
  return { pass: m[passGroupIndex] !== undefined ? Number(m[passGroupIndex]) : undefined, fail: m[1] !== undefined ? Number(m[1]) : 0 };
}

/**
 * Vitest — ` Tests  1 failed | 1 passed (2)` (the `failed |` clause is absent
 * on an all-pass run). The `passed` clause itself is optional: a failed-only
 * summary (` Tests  2 failed (2)`) reports no `passed` count at all — the
 * `Tests` header plus a parenthesised total is still required so an
 * unrelated line never matches.
 */
export function parseVitest(output: string): { pass?: number; fail?: number } {
  const m = output.match(/Tests\s+(?:(\d+) failed(?:\s*\|\s*)?)?(?:(\d+) passed)?\s*\(/);
  return parseFailedPassedSummary(m, 2);
}

/**
 * Jest — `Tests:       2 failed, 12 passed, 14 total` (`skipped` clause
 * optional). The `passed` clause is itself optional: `Tests: 2 failed, 2
 * total` (no passing tests at all) still needs `fail` recognised — only the
 * `Tests:` header + mandatory `total` count anchor the match.
 */
export function parseJest(output: string): { pass?: number; fail?: number } {
  const m = output.match(/Tests:\s+(?:(\d+) failed,\s*)?(?:(\d+) skipped,\s*)?(?:(\d+) passed,\s*)?(\d+) total/);
  if (!m) return {};
  return { pass: m[3] !== undefined ? Number(m[3]) : undefined, fail: m[1] !== undefined ? Number(m[1]) : 0 };
}

/** `npm|pnpm|yarn test` — the underlying runner is unknown from the command alone; try each format in turn. */
export function parseNpmGeneric(output: string): { pass?: number; fail?: number } {
  const vitest = parseVitest(output);
  if (vitest.pass !== undefined) return vitest;
  const jest = parseJest(output);
  if (jest.pass !== undefined) return jest;
  return parseBunTest(output);
}

/**
 * pytest — restricted to the summary line ending `in <seconds>s` (e.g.
 * `===== 2 failed, 12 passed, 1 skipped in 0.53s =====`), the LAST such line
 * when several appear (an earlier `===== ERRORS =====` section header has no
 * `in Ns` suffix, so it never qualifies). D2: the `=` padding is COSMETIC,
 * never mandatory — a bare `-q`/`-x`/`-k` run prints the same summary
 * undecorated (`2 passed in 0.01s`, `1 failed, 2 passed in 0.02s`,
 * `no tests ran in 0.01s`); the last form reports `pass: 0` as POSITIVE
 * evidence pytest ran and matched nothing, never `{}`. Fail sums `failed` +
 * `errors`.
 */
export function parsePytest(output: string): { pass?: number; fail?: number } {
  const isSummary = (line: string) =>
    /\b\d+ (?:passed|failed|errors?|skipped|xfailed|xpassed|deselected)\b/.test(line) || /\bno tests ran\b/.test(line);
  const lines = [...output.matchAll(/^.*\bin [\d.]+s.*$/gm)].map((m) => m[0]).filter(isSummary);
  const summary = lines.length ? lines[lines.length - 1] : undefined;
  if (summary === undefined) return {};
  if (/\bno tests ran\b/.test(summary)) return { pass: 0 };
  const passM = summary.match(/(\d+) passed/);
  const failM = summary.match(/(\d+) failed/);
  const errM = summary.match(/(\d+) errors?\b/);
  const fail = failM || errM ? (failM ? Number(failM[1]) : 0) + (errM ? Number(errM[1]) : 0) : undefined;
  return { pass: passM ? Number(passM[1]) : undefined, fail };
}

/**
 * `go test` — fail = `--- FAIL: ` line count (leading indentation included —
 * a subtest's `--- FAIL:` is tab-indented under its parent `--- FAIL:`/
 * `--- PASS:` line), else package-level `FAIL` lines, else 0. Pass = count of
 * `^ok\s` lines (one per successful package, `(cached)` included) — POSITIVE
 * evidence a package actually ran, closing the gap where a piped/filtered
 * invocation (`go test ./... | grep -c ok`) kept `fail: 0` with no real proof
 * anything executed (D2) — EXCEPT an `ok` line itself tagged `[no tests to
 * run]` (a filtered package matched zero tests), which doesn't count as
 * executed evidence. A `?   \tpkg\t[no test files]` line never starts with
 * `ok`, so it is already excluded without a separate check. `pass: 0` only
 * when there is no other `ok` line at all (real M2 "tests ran" floor); with
 * NO `ok` line whatsoever (e.g. a compile failure), `pass` stays `undefined`
 * — no evidence either way.
 */
export function parseGoTest(output: string): { pass?: number; fail?: number } {
  const okLines = output.match(/^ok\s.*$/gm);
  const executed = okLines ? okLines.filter((l) => !l.includes("[no tests to run]")) : [];
  const failLines = output.match(/^\s*--- FAIL: /gm);
  const pkgFail = output.match(/^FAIL\b/gm);
  const fail = failLines ? failLines.length : pkgFail ? pkgFail.length : 0;
  return { pass: okLines ? executed.length : undefined, fail };
}

/**
 * `cargo test` — sums every `test result: ok|FAILED. N passed; M failed;`
 * line (one per test binary). Cargo's own `error: N targets failed` line
 * only ADDS to `fail` when no `test result:` line reported a failure yet
 * (D5: `cargo test --no-fail-fast 2>&1 | tail -N` can truncate away a
 * failing target's `test result: FAILED` line while this trailing line
 * survives — a fail floor even with zero `test result:` lines); when a
 * `test result: FAILED` line already counted the failure, the marker is
 * the SAME failure restated, not an additional one, and must not double it.
 */
export function parseCargoTest(output: string): { pass?: number; fail?: number } {
  const re = /test result: (?:ok|FAILED)\. (\d+) passed; (\d+) failed;/g;
  let pass = 0;
  let fail = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(output)) !== null) {
    matched = true;
    pass += Number(m[1]);
    fail += Number(m[2]);
  }
  const targetsFailed = output.match(/^error: (\d+) targets? failed\b/m);
  if (targetsFailed) {
    matched = true;
    if (fail === 0) fail += Number(targetsFailed[1]);
  }
  return matched ? { pass, fail } : {};
}

/** `swift test` — sums the LAST XCTest `Executed N tests, with M failures` line and every swift-testing `Test run with N tests ... passed|failed after` line. */
export function parseSwiftTest(output: string): { pass?: number; fail?: number } {
  let pass: number | undefined;
  let fail: number | undefined;
  const xcRe = /Executed (\d+) tests?, with (\d+) failures?/g;
  let xcLast: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = xcRe.exec(output)) !== null) xcLast = m;
  if (xcLast) {
    const executed = Number(xcLast[1]);
    const failures = Number(xcLast[2]);
    pass = (pass ?? 0) + (executed - failures);
    fail = (fail ?? 0) + failures;
  }
  const stRe = /Test run with (\d+) tests?(?: in \d+ suites?)? (passed|failed) after/g;
  let sm: RegExpExecArray | null;
  while ((sm = stRe.exec(output)) !== null) {
    if (sm[2] === "failed") fail = (fail ?? 0) + 1;
    else pass = (pass ?? 0) + Number(sm[1]);
  }
  return { pass, fail };
}

/**
 * `dart test` / `flutter test` — only an overall pass/fail banner, no real
 * counts: `All tests passed!` reports `pass: 1` as BOOLEAN positive evidence
 * (D1: without it, the test-kind floor — pass > 0 — would reject every
 * genuinely green dart/flutter run for lack of a numeric count).
 */
export function parseDartTest(output: string): { pass?: number; fail?: number } {
  if (/All tests passed!/.test(output)) return { pass: 1, fail: 0 };
  if (/Some tests failed\./.test(output)) return { fail: 1 };
  return {};
}
