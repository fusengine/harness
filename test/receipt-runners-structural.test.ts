import { test, expect } from "bun:test";
import { classifyReceipt } from "../src/tracking/receipts";

const T = 1_000_000_000_000;

test("structural: a trailing echo of fake counts never resets a real runner into a receipt", () => {
  expect(classifyReceipt('bun test; echo " 12 pass"; echo " 0 fail"', "", 0, T)).toBeNull();
  expect(classifyReceipt('pytest; echo "===== 12 passed in 0.1s ====="', "", 0, T)).toBeNull();
  expect(classifyReceipt('mypy src; echo "Success: no issues found in 1 source file"', "", 0, T)).toBeNull();
});

test("structural: any output redirection after the runner in its own segment nulls it", () => {
  expect(classifyReceipt("bunx tsc --noEmit > tsc.log 2>&1; :", "", 0, T)).toBeNull();
  expect(classifyReceipt("go vet ./... > v.log 2>&1", "", 0, T)).toBeNull();
  expect(classifyReceipt("bun test > out.txt", " 1 pass\n 0 fail\n", 0, T)).toBeNull();
});

test("structural: the runner must be the LAST list segment, a pipe is not a list separator", () => {
  expect(classifyReceipt("cd x && bun test", " 3 pass\n 0 fail\n", 0, T)).toMatchObject({ tool: "bun test", pass: 3, fail: 0 });
  expect(classifyReceipt("bun test 2>&1 | tail -5", " 3 pass\n 0 fail\n", 0, T)).toMatchObject({ tool: "bun test", pass: 3, fail: 0 });
  expect(classifyReceipt("bun test && git commit -m x", "", 0, T)).toBeNull();
});

test("regression: parseGoTest ignores [no test files] lines and [no tests to run] ok lines", () => {
  const mixed = "?   \tex/foo\t[no test files]\nok  \tex/bar\t0.012s";
  expect(classifyReceipt("go test ./...", mixed, 0, T)).toMatchObject({ tool: "go test", pass: 1 });

  const onlyNoFiles = "?   \tex/foo\t[no test files]\n?   \tex/bar\t[no test files]";
  const r = classifyReceipt("go test ./...", onlyNoFiles, 0, T);
  expect(r?.pass === undefined || r.pass === 0).toBe(true);
});

test("regression: php artisan test routes Pest-style output to parsePest first", () => {
  expect(classifyReceipt("php artisan test", "Tests:    2 passed (2 assertions)", 0, T)).toMatchObject({ tool: "phpunit", pass: 2, fail: 0 });
  expect(classifyReceipt("php artisan test", "Tests:    1 failed, 1 passed (3 assertions)", 1, T)).toMatchObject({ tool: "phpunit", pass: 1, fail: 1 });
});

test("regression: swift test --skip-build still runs the tests (no longer informational)", () => {
  expect(classifyReceipt("swift test --skip-build", "Executed 12 tests, with 0 failures", 0, T)).toMatchObject({
    tool: "swift test",
    pass: 12,
    fail: 0,
  });
});

test("regression: ANSI-colorized bun summary parses identically to plain text", () => {
  const out = "\x1b[32m 12 pass\x1b[0m\n 0 fail";
  expect(classifyReceipt("bun test", out, 0, T)).toMatchObject({ tool: "bun test", pass: 12, fail: 0 });
});
