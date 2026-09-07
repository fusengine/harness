import { test, expect } from "bun:test";
import { classifyReceipt } from "../src/tracking/receipts";

const T = 1_000_000_000_000;

test("bun test: pass/fail", () => {
  expect(classifyReceipt("bun test", " 8 pass\n 0 fail\n", 0, T)).toMatchObject({ kind: "test", tool: "bun test", pass: 8, fail: 0 });
  expect(classifyReceipt("bun test", " 0 pass\n 8 fail\n", 1, T)).toMatchObject({ kind: "test", tool: "bun test", pass: 0, fail: 8 });
});

test("vitest: pass/fail", () => {
  expect(classifyReceipt("vitest run", " Tests  2 passed (2)", 0, T)).toMatchObject({ tool: "vitest", pass: 2, fail: 0 });
  expect(classifyReceipt("vitest run", " Tests  1 failed | 1 passed (2)", 1, T)).toMatchObject({ tool: "vitest", pass: 1, fail: 1 });
});

test("jest: pass/fail", () => {
  expect(classifyReceipt("jest", "Tests:       14 passed, 14 total", 0, T)).toMatchObject({ tool: "jest", pass: 14, fail: 0 });
  expect(classifyReceipt("jest", "Tests:       2 failed, 12 passed, 14 total", 1, T)).toMatchObject({ tool: "jest", pass: 12, fail: 2 });
});

test("npm/pnpm/yarn test: falls back through vitest -> jest -> bun formats", () => {
  expect(classifyReceipt("npm test", "Tests:       2 failed, 12 passed, 14 total", 1, T)).toMatchObject({ tool: "npm/pnpm/yarn test", pass: 12, fail: 2 });
  expect(classifyReceipt("npm run test", " Tests  1 failed | 1 passed (2)", 1, T)).toMatchObject({ tool: "npm/pnpm/yarn test", pass: 1, fail: 1 });
});

test("pytest: pass, fail sums failed+errors", () => {
  expect(classifyReceipt("pytest -q", "===== 12 passed in 0.53s =====", 0, T)).toMatchObject({ tool: "pytest", pass: 12, fail: undefined });
  expect(classifyReceipt("pytest -q", "===== 2 failed, 12 passed, 1 skipped in 0.53s =====", 1, T)).toMatchObject({ tool: "pytest", pass: 12, fail: 2 });
});

test("go test: fail from --- FAIL: lines, else package FAIL line; pass = count of ok lines", () => {
  // D2 fix: pass is now POSITIVE evidence (count of `^ok ` lines), not
  // undefined-by-default — a single successful package reports pass: 1.
  expect(classifyReceipt("go test ./...", "ok  \tpkg\t0.1s", 0, T)).toMatchObject({ tool: "go test", pass: 1, fail: 0 });
  expect(classifyReceipt("go test ./...", "--- FAIL: TestX\n--- FAIL: TestY\nFAIL\tpkg\t0.1s", 1, T)).toMatchObject({ tool: "go test", fail: 2 });
});

test("cargo test: sums every 'test result:' line", () => {
  const out = "test result: ok. 12 passed; 0 failed; 0 ignored\ntest result: FAILED. 3 passed; 1 failed; 0 ignored";
  expect(classifyReceipt("cargo test", out, 1, T)).toMatchObject({ tool: "cargo test", pass: 15, fail: 1 });
});

test("phpunit / php artisan test: OK on success, Tests:/Failures: on failure", () => {
  expect(classifyReceipt("phpunit", "OK (12 tests, 30 assertions)", 0, T)).toMatchObject({ tool: "phpunit", pass: 12, fail: 0 });
  expect(classifyReceipt("php artisan test", "FAILURES!\nTests: 12, Assertions: 30, Failures: 2.", 1, T)).toMatchObject({ tool: "phpunit", pass: 10, fail: 2 });
});

test("pest: Tests: N failed, M passed (...)", () => {
  expect(classifyReceipt("pest", "Tests:  2 failed, 10 passed (30 assertions)", 1, T)).toMatchObject({ tool: "pest", pass: 10, fail: 2 });
});

test("swift test: XCTest last-summary + swift-testing summary, summed", () => {
  const out = "Executed 5 tests, with 1 failure\nTest run with 3 tests in 1 suite passed after 0.2 seconds";
  expect(classifyReceipt("swift test", out, 1, T)).toMatchObject({ tool: "swift test", pass: 4 + 3, fail: 1 });
});

test("dart/flutter test: pass/fail banner only", () => {
  expect(classifyReceipt("flutter test", "All tests passed!", 0, T)).toMatchObject({ tool: "dart/flutter test", fail: 0 });
  expect(classifyReceipt("dart test", "Some tests failed.", 1, T)).toMatchObject({ tool: "dart/flutter test", fail: 1 });
});

test("mypy: Found N errors / Success", () => {
  expect(classifyReceipt("mypy .", "Success: no issues found in 5 source files", 0, T)).toMatchObject({ tool: "mypy", fail: 0 });
  expect(classifyReceipt("mypy .", "Found 3 errors in 2 files", 1, T)).toMatchObject({ tool: "mypy", fail: 3 });
});

test("pyright: N errors, M warnings", () => {
  expect(classifyReceipt("pyright", "1 error, 0 warnings, 0 informations", 1, T)).toMatchObject({ tool: "pyright", fail: 1 });
});

test("phpstan: [ERROR] Found N errors / [OK]", () => {
  expect(classifyReceipt("phpstan analyse", "[OK] No errors", 0, T)).toMatchObject({ tool: "phpstan", fail: 0 });
  expect(classifyReceipt("phpstan analyse", "[ERROR] Found 3 errors", 1, T)).toMatchObject({ tool: "phpstan", fail: 3 });
});

test("go vet / go build / cargo check / cargo clippy / swift build: exit code only, no counts", () => {
  expect(classifyReceipt("go vet ./...", "", 0, T)).toMatchObject({ tool: "go vet", kind: "tsc" });
  expect(classifyReceipt("go build ./...", "", 0, T)).toMatchObject({ tool: "go build", kind: "tsc" });
  expect(classifyReceipt("cargo check", "", 0, T)).toMatchObject({ tool: "cargo check", kind: "tsc" });
  expect(classifyReceipt("cargo clippy", "", 0, T)).toMatchObject({ tool: "cargo clippy", kind: "tsc" });
  expect(classifyReceipt("swift build", "", 0, T)).toMatchObject({ tool: "swift build", kind: "tsc" });
});

test("anchoring negatives: an argument/quoted mention is never a receipt", () => {
  expect(classifyReceipt('git commit -m "fix: jest flake"', "", 0, T)).toBeNull();
  expect(classifyReceipt("echo pytest done", "", 0, T)).toBeNull();
  expect(classifyReceipt('grep -rn "cargo test" docs/', "", 0, T)).toBeNull();
});

test("anchoring positives: wrappers and prefixes still resolve to the right tool", () => {
  expect(classifyReceipt("cd api && vendor/bin/phpunit", "OK (1 tests, 1 assertions)", 0, T)).toMatchObject({ tool: "phpunit" });
  expect(classifyReceipt("uv run pytest -q", "1 passed in 0.1s", 0, T)).toMatchObject({ tool: "pytest" });
  expect(classifyReceipt("time bun test", " 1 pass\n 0 fail\n", 0, T)).toMatchObject({ tool: "bun test" });
  expect(classifyReceipt("FOO=1 go test ./...", "ok\tpkg\t0.1s", 0, T)).toMatchObject({ tool: "go test" });
  expect(classifyReceipt("bun test 2>&1 | tail -5", " 1 pass\n 0 fail\n", 0, T)).toMatchObject({ tool: "bun test" });
});
