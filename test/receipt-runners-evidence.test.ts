import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { classifyReceipt, captureReceipt, freshReceiptFromFile, recordReceipt, freshPassingReceipt } from "../src/tracking/receipts";
import { captureBashReceipt } from "../src/runtime/receipt-capture";
import { emptyTrack } from "../src/tracking/session-state";

const T = 1_000_000_000_000;
const WIN = 365 * 24 * 3600 * 1000;
const file = (): string => join(mkdtempSync(join(tmpdir(), "fh-ev-")), "track.json");

/** Whether `command` would leave a receipt that grants "done" right now. */
async function passes(command: string, output: string, exitCode: number): Promise<boolean> {
  const f = file();
  await captureReceipt(f, command, output, exitCode, T);
  return freshReceiptFromFile(f, WIN, T + 1) !== null;
}

test("D1: informational invocations are never a receipt at all", () => {
  const cmds = [
    "tsc --version", "bunx tsc --version", "pytest --version", "bun test --help",
    "mypy --version", "cargo test --help", "go vet -h", "jest --showConfig",
    "pyright --version", "vitest --version", "swift build --help", "pytest --fixtures",
    "cargo clippy --version", "go build -n ./...", "phpunit --version", "npx jest --init",
    "go test -count=0 ./...",
  ];
  for (const cmd of cmds) expect(classifyReceipt(cmd, "", 0, T)).toBeNull();
});

test("D2: output suppression / exit decoupling never grants a passing receipt", async () => {
  expect(await passes("bun test 2>/dev/null | cat", "", 0)).toBe(false);
  expect(await passes("mypy src 2>/dev/null | cat", "", 0)).toBe(false);
  expect(await passes("bun test 2>/dev/null; git commit -m x", "", 0)).toBe(false);
  expect(await passes("bun test | grep -c pass", "12", 0)).toBe(false);
  expect(await passes('echo "$(pytest -q 2>&1 >/dev/null)"', "", 0)).toBe(false);
  expect(await passes("go test ./... 2>&1 | grep -c ok", "2", 0)).toBe(false);
  expect(await passes("tsc --noEmit 2>&1 | wc -l", "42", 0)).toBe(false);
  expect(await passes("timeout 5 bun test 2>/dev/null | cat", "", 0)).toBe(false);
  expect(await passes('true && echo "$(tsc --noEmit)"', "TypeError: crashed\n", 0)).toBe(false);
  expect(await passes('echo "$(bun test 2>/dev/null)"', "", 0)).toBe(false);
});

test("D3: a fail-shaped test NAME never masks the real (green) summary", () => {
  const out = "(pass) parse > returns 3 fail codes [0.10ms]\n\n 12 pass\n 0 fail";
  expect(classifyReceipt("bun test", out, 0, T)).toMatchObject({ tool: "bun test", pass: 12, fail: 0 });
});

test("D3: not passing when the real summary line is genuinely red", async () => {
  const out = "(pass) parse > returns 3 fail codes [0.10ms]\n\n 12 pass\n 0 fail";
  expect(await passes("bun test", out, 0)).toBe(true);
});

test("D4: a missing exit_code is never credited as exit 0 (no receipt recorded)", async () => {
  const f = file();
  const response = { stdout: " 8 pass\n 0 fail\n", stderr: "" }; // no exit_code field
  await captureBashReceipt(f, "Bash", "bun test", undefined, response, T);
  expect(freshReceiptFromFile(f, WIN, T + 1)).toBeNull();
});

test("regression: every previously-green invocation still passes", async () => {
  expect(await passes("bun test", " 12 pass\n 0 fail\n", 0)).toBe(true);
  expect(await passes("bun test 2>&1 | tail -5", " 12 pass\n 0 fail\n", 0)).toBe(true);
  expect(await passes("bunx tsc --noEmit", "", 0)).toBe(true);
  expect(await passes("go test ./...", "ok  \tpkg1\t0.1s\nok  \tpkg2\t0.1s", 0)).toBe(true);
  expect(await passes("mypy src", "Success: no issues found in 3 source files", 0)).toBe(true);
  expect(await passes("cargo check", "Finished dev [unoptimized + debuginfo] target(s) in 0.52s", 0)).toBe(true);
  expect(await passes("swift build", "Build complete! (1.23s)", 0)).toBe(true);
  expect(await passes("dart test", "All tests passed!", 0)).toBe(true);
});

test("regression: legacy (no `tool` field) receipts keep the pre-fix contract", () => {
  const legacyTsc = recordReceipt(emptyTrack(), { kind: "tsc", exitCode: 0, ts: T });
  expect(freshPassingReceipt(legacyTsc, WIN, T + 1)).not.toBeNull();

  const legacyTest = recordReceipt(emptyTrack(), { kind: "test", exitCode: 0, pass: 12, fail: 0, ts: T });
  expect(freshPassingReceipt(legacyTest, WIN, T + 1)).not.toBeNull();
});
