/**
 * Regressions for two false positives found on real tool output, split from
 * `receipt-runners-realworld.test.ts` to stay under the SOLID line ceiling:
 * `parsePhpunit` (`./receipt-runners-parse-php`) counting skipped tests as
 * passing on an all-skipped `OK` suite, and `parseCargoTest`
 * (`./receipt-runners-parse`) double-counting a failure already reported by a
 * `test result: FAILED` line via cargo's trailing `error: N targets failed`
 * marker.
 */
import { test, expect } from "bun:test";
import { classifyReceipt, recordReceipt, freshPassingReceipt } from "../src/tracking/receipts";
import { emptyTrack } from "../src/tracking/session-state";

const T = 1_000_000_000_000;
const WIN = 365 * 24 * 3600 * 1000;

test("phpunit all-skipped 'OK' suite is NOT a passing receipt (Tests includes skipped)", () => {
  const r = classifyReceipt("phpunit", "OK, but some tests were skipped!\nTests: 3, Assertions: 0, Skipped: 3.", 0, T);
  expect(r).toMatchObject({ tool: "phpunit", pass: 0, fail: 0 });
  const track = recordReceipt(emptyTrack(), r!);
  expect(freshPassingReceipt(track, WIN, T + 1)).toBeNull();
});

test("phpunit 'OK, but some tests were skipped!' subtracts Skipped from Tests", () => {
  expect(
    classifyReceipt("phpunit", "OK, but some tests were skipped!\nTests: 3, Assertions: 4, Skipped: 1.", 0, T),
  ).toMatchObject({ tool: "phpunit", pass: 2, fail: 0 });
});

test("phpunit 'OK, but there were issues!' with Deprecations (no Skipped) keeps pass = Tests", () => {
  expect(
    classifyReceipt("phpunit", "OK, but there were issues!\nTests: 2, Assertions: 3, Deprecations: 1.", 0, T),
  ).toMatchObject({ tool: "phpunit", pass: 2, fail: 0 });
});

test("cargo test: 'error: N targets failed' is not added on top of a per-binary FAILED count", () => {
  const output = "test result: FAILED. 1 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out\nerror: 1 target failed";
  expect(classifyReceipt("cargo test", output, 1, T)).toMatchObject({ tool: "cargo test", fail: 1 });
});

test("cargo test: 'error: N targets failed' alone (summary line scrolled off) still reports fail 1", () => {
  expect(classifyReceipt("cargo test --no-fail-fast", "error: 1 target failed", 1, T)).toMatchObject({
    tool: "cargo test", fail: 1,
  });
});
