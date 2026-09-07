/**
 * Challenger v4 D1-D5 false negatives, measured on REAL tool output —
 * regressions for `receipt-runners-parse.ts`, `receipt-runners-parse-php.ts`,
 * `receipt-runners-parse-static.ts`, and `receipt-runners.ts`'s
 * `PREFIX`/`OPTS`/generic-runner regexes.
 */
import { test, expect } from "bun:test";
import { classifyReceipt } from "../src/tracking/receipts";

const T = 1_000_000_000_000;

test("D1: cargo check/clippy real padded 'Finished' banner (4 leading spaces) parses to fail 0", () => {
  const real = "    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.02s";
  expect(classifyReceipt("cargo check", real, 0, T)).toMatchObject({ tool: "cargo check", fail: 0 });
  expect(classifyReceipt("cargo clippy", real, 0, T)).toMatchObject({ tool: "cargo clippy", fail: 0 });
});

test("D2: pytest -q undecorated summary variants (no '=' padding)", () => {
  expect(classifyReceipt("pytest -q", "2 passed in 0.01s", 0, T)).toMatchObject({ tool: "pytest", pass: 2, fail: undefined });
  expect(classifyReceipt("pytest -x", "1 failed, 2 passed in 0.02s", 1, T)).toMatchObject({ tool: "pytest", pass: 2, fail: 1 });
  expect(classifyReceipt("pytest -k missing", "no tests ran in 0.01s", 5, T)).toMatchObject({ tool: "pytest", pass: 0 });
});

test("D3: phpunit 10-13 'OK, but ...' banners still report success with the right pass count", () => {
  expect(classifyReceipt("phpunit", "OK (12 tests, 30 assertions)", 0, T)).toMatchObject({ tool: "phpunit", pass: 12, fail: 0 });
  expect(
    classifyReceipt("phpunit", "OK, but there were issues!\nTests: 12, Assertions: 30, Skipped: 1.", 0, T),
  ).toMatchObject({ tool: "phpunit", pass: 11, fail: 0 });
  expect(
    classifyReceipt("phpunit", "OK, but some tests were skipped!\nTests: 12, Assertions: 30, Deprecations: 1.", 0, T),
  ).toMatchObject({ tool: "phpunit", pass: 12, fail: 0 });
});

test("D3: phpunit failure markers still take precedence and still fail", () => {
  expect(classifyReceipt("phpunit", "FAILURES!\nTests: 12, Assertions: 30, Failures: 2.", 1, T)).toMatchObject({
    tool: "phpunit", pass: 10, fail: 2,
  });
  expect(classifyReceipt("phpunit", "FAILED", 1, T)).toMatchObject({ tool: "phpunit", fail: 1 });
});

test("D4: option tokens tolerated between a wrapper/runner and the tool name", () => {
  expect(classifyReceipt("uv run --frozen pytest -q", "1 passed in 0.1s", 0, T)).toMatchObject({ tool: "pytest", pass: 1 });
  expect(classifyReceipt("pnpm -r test", "Tests:       2 failed, 12 passed, 14 total", 1, T)).toMatchObject({
    tool: "npm/pnpm/yarn test", pass: 12, fail: 2,
  });
  expect(classifyReceipt("pnpm --filter api test", " Tests  1 failed | 1 passed (2)", 1, T)).toMatchObject({
    tool: "npm/pnpm/yarn test", pass: 1, fail: 1,
  });
  expect(classifyReceipt("bun run test", " 8 pass\n 0 fail\n", 0, T)).toMatchObject({
    tool: "npm/pnpm/yarn test", pass: 8, fail: 0,
  });
});

test("D5: cargo test's own 'error: N targets failed' line is a fail floor a truncating pipe can't hide", () => {
  const truncated = "error: 1 target failed:\n    `tests::a`";
  expect(classifyReceipt("cargo test --no-fail-fast", truncated, 1, T)).toMatchObject({ tool: "cargo test", fail: 1 });
});
