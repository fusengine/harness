import { test, expect } from "bun:test";
import { classifyReceipt } from "../src/tracking/receipts";

const T = 1_000_000_000_000;

test("L4: go test indented (subtest) --- FAIL: lines are counted", () => {
  const out = "--- FAIL: TestParent\n    --- FAIL: TestParent/child\nFAIL\tpkg\t0.1s";
  expect(classifyReceipt("go test ./...", out, 1, T)).toMatchObject({ tool: "go test", fail: 2 });
});

test("L4: pest failed-only summary (no passed clause) parses to fail>0", () => {
  const out = "Tests: 2 failed (5 assertions)";
  expect(classifyReceipt("pest", out, 1, T)).toMatchObject({ tool: "pest", fail: 2, pass: undefined });
});

test("L4: jest failed-only summary (no passed clause) parses to fail>0", () => {
  const out = "Tests:       2 failed, 2 total";
  expect(classifyReceipt("jest", out, 1, T)).toMatchObject({ tool: "jest", fail: 2, pass: undefined });
});

test("L4: vitest failed-only summary (no passed clause) parses to fail>0", () => {
  const out = "Tests  2 failed (2)";
  expect(classifyReceipt("vitest run", out, 1, T)).toMatchObject({ tool: "vitest", fail: 2, pass: undefined });
});

test("L4: pyright '1 error ' without the warnings clause still parses", () => {
  expect(classifyReceipt("pyright", "1 error ", 1, T)).toMatchObject({ tool: "pyright", fail: 1 });
});

test("L4: PHPUnit 10+ FAILED banner is recognised (fail >= 1) even with no Tests: detail line", () => {
  expect(classifyReceipt("phpunit", "FAILED", 1, T)).toMatchObject({ tool: "phpunit", fail: 1 });
});
