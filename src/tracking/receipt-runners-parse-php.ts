/**
 * @module receipt-runners-parse-php
 * Pass/fail count parsers for {@link RunnerSpec.counts} (`./receipt-runners`)
 * covering PHP test runners (`phpunit`, `pest`). Split out of
 * `./receipt-runners-parse` (the other test-runner formats), which still
 * owns {@link parseFailedPassedSummary}, to keep both files under the SOLID
 * line ceiling.
 */
import { parseFailedPassedSummary } from "./receipt-runners-parse";

/**
 * phpunit / `php artisan test` — three success banners on exit 0, all
 * starting with `OK`: `OK (N tests, M assertions)`, `OK, but there were
 * issues!`, and `OK, but some tests were skipped!` (PHPUnit 10-13; the last
 * two are followed by a `Tests: N, Assertions: M, Skipped: …`/
 * `…, Deprecations: …` detail line, D3). Failure markers (`FAILURES!`,
 * `ERRORS!`, PHPUnit 10+'s bare `FAILED`) take PRECEDENCE over any `OK`
 * banner and are checked first; `Tests: N, Assertions: M[, Errors: E]
 * [, Failures: F].` on failure. When no `Tests:` detail line follows a
 * failure marker, `fail: 1` still records a definite failure rather than
 * reporting nothing. `Tests: N` on an `OK, but …` banner INCLUDES skipped
 * tests, so `pass` subtracts `Skipped: S` (tolerating any intervening
 * `[, Errors:][, Failures:][, Warnings:][, Deprecations:]` clause) — an
 * all-skipped suite (`Tests: 3, Skipped: 3`) must report `pass: 0`, never 3.
 */
export function parsePhpunit(output: string): { pass?: number; fail?: number } {
  const detail = output.match(/Tests: (\d+), Assertions: \d+(?:, Errors: (\d+))?(?:, Failures: (\d+))?/);
  if (/^(?:FAILURES|ERRORS|FAILED)\b/m.test(output)) {
    if (!detail) return { fail: 1 };
    const total = Number(detail[1]);
    const errors = detail[2] !== undefined ? Number(detail[2]) : 0;
    const failures = detail[3] !== undefined ? Number(detail[3]) : 0;
    const fail = errors + failures || 1;
    return { pass: total - fail, fail };
  }
  if (/^OK\b/m.test(output)) {
    const okM = output.match(/^OK \((\d+) tests?/m);
    if (okM) return { pass: Number(okM[1]), fail: 0 };
    if (detail) {
      const skippedM = output.match(/\bSkipped: (\d+)/);
      const skipped = skippedM ? Number(skippedM[1]) : 0;
      return { pass: Math.max(0, Number(detail[1]) - skipped), fail: 0 };
    }
    return { pass: 1, fail: 0 };
  }
  return {};
}

/**
 * Pest — `Tests:  2 failed, 10 passed (30 assertions)` (`skipped` clause
 * optional). The `passed` clause is itself optional: a failed-only summary
 * (`Tests: 2 failed (5 assertions)`, no trailing comma) still needs `fail`
 * recognised — only the `Tests:` header + parenthesised assertions anchor it.
 */
export function parsePest(output: string): { pass?: number; fail?: number } {
  const m = output.match(/Tests:\s+(?:(\d+) failed,?\s*)?(?:(\d+) skipped,\s*)?(?:(\d+) passed)?\s*\(/);
  return parseFailedPassedSummary(m, 3);
}
