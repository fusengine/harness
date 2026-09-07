import { test, expect } from "bun:test";
import { classifyReceipt } from "../src/tracking/receipts";

const T = 1_000_000_000_000;

test("H1: heredoc body mentioning a runner is never a receipt", () => {
  const cmd = "cat <<'E' > notes.md\nbun test is green\nE";
  expect(classifyReceipt(cmd, "", 0, T)).toBeNull();
});

test("H1: a multi-line commit message mentioning a runner is never a receipt", () => {
  expect(classifyReceipt('git commit -m "fix\nbun test now green"', "", 0, T)).toBeNull();
});

test("H1: a tool name sitting after a real backtick substitution is never a receipt", () => {
  expect(classifyReceipt("echo `date` mypy src", "", 0, T)).toBeNull();
});

test("H1: a real newline-separated multi-line script is still recognised", () => {
  expect(classifyReceipt("cd x\nbun test", " 1 pass\n 0 fail\n", 0, T)).toMatchObject({ tool: "bun test", pass: 1, fail: 0 });
});

test("M2: every no-run/collect-only/watch/list flag is never a receipt", () => {
  expect(classifyReceipt("cargo test --no-run", "", 0, T)).toBeNull();
  expect(classifyReceipt("pytest --collect-only", "", 0, T)).toBeNull();
  expect(classifyReceipt("pytest --co", "", 0, T)).toBeNull();
  expect(classifyReceipt("bun test --watch", "", 0, T)).toBeNull();
  expect(classifyReceipt("npm run test:watch", "", 0, T)).toBeNull();
  expect(classifyReceipt("npm test -- --watch", "", 0, T)).toBeNull();
  expect(classifyReceipt("jest --listTests", "", 0, T)).toBeNull();
  expect(classifyReceipt("jest --watchAll", "", 0, T)).toBeNull();
  expect(classifyReceipt("swift test --list-tests", "", 0, T)).toBeNull();
  expect(classifyReceipt("flutter test --dry-run", "", 0, T)).toBeNull();
  expect(classifyReceipt("jest --watchAll", "", 0, T)).toBeNull();
  expect(classifyReceipt("vitest run --watch", "", 0, T)).toBeNull();
});

test("M2: --watch=false / --watchAll=false explicitly disable watch mode and are still a receipt", () => {
  expect(classifyReceipt("vitest --watch=false", " Tests  2 passed (2)", 0, T)).toMatchObject({ tool: "vitest", pass: 2 });
  expect(classifyReceipt("jest --watchAll=false", "Tests:       2 passed, 2 total", 0, T)).toMatchObject({ tool: "jest", pass: 2 });
  // still rejected when watch mode is explicitly ON or unqualified
  expect(classifyReceipt("vitest --watch=true", "", 0, T)).toBeNull();
  expect(classifyReceipt("jest --watchAll=true", "", 0, T)).toBeNull();
});

test("M2: a zero-executed test run is classified (pass: 0) but rejected by isPassing's floor", () => {
  const cargoZero = classifyReceipt("cargo test", "test result: ok. 0 passed; 0 failed; 0 ignored", 0, T);
  expect(cargoZero).toMatchObject({ tool: "cargo test", pass: 0, fail: 0, exitCode: 0 });

  // Real `go test` tags a filtered zero-match package on the `ok` line itself
  // (`ok  \tpkg\t0.001s [no tests to run]`) — that tag, not a separate warning
  // line anywhere in the output, is what excludes it from the executed count.
  const goNoTests = classifyReceipt("go test -run ZZZ ./...", "ok  \tpkg\t0.001s [no tests to run]", 0, T);
  expect(goNoTests).toMatchObject({ tool: "go test", pass: 0, fail: 0, exitCode: 0 });
});

test("D2: a pipe after a STATIC-kind runner is never a receipt, even with real diagnostics in the piped output", () => {
  // Superseded hardening: a pipe stage can reorder/truncate/recount whatever
  // a static checker printed (D2's `tsc --noEmit 2>&1 | wc -l` forging a
  // PASS is the same shape) — a static check's only proof is silence, which
  // a pipe can no longer guarantee, so classifyReceipt nulls it outright
  // instead of trusting output-parsed diagnostics through it.
  const out = "src/a.ts(1,1): error TS2304: Cannot find name 'x'.\nsrc/b.ts(2,2): error TS2304: Cannot find name 'y'.\n";
  const r = classifyReceipt("bunx tsc --noEmit 2>&1 | head -20", out, 0, T);
  expect(r).toBeNull();
});

test("M3: explicit exit-masking forms are never a receipt", () => {
  expect(classifyReceipt("bunx tsc --noEmit || true", "error TS2304: x", 0, T)).toBeNull();
  expect(classifyReceipt("bunx tsc --noEmit || :", "error TS2304: x", 0, T)).toBeNull();
  expect(classifyReceipt("bunx tsc --noEmit || echo failed", "error TS2304: x", 0, T)).toBeNull();
  expect(classifyReceipt("bunx tsc --noEmit; true", "error TS2304: x", 0, T)).toBeNull();
});

test("M3: go vet / cargo clippy / swift build diagnostics parse to a non-zero fail", () => {
  const vet = classifyReceipt("go vet ./...", "./main.go:10:2: unreachable code", 0, T);
  expect(vet).toMatchObject({ tool: "go vet", fail: 1 });

  const clippy = classifyReceipt("cargo clippy", "error[E0308]: mismatched types\n --> src/main.rs:2:5", 0, T);
  expect(clippy).toMatchObject({ tool: "cargo clippy", fail: 1 });

  const swiftOk = classifyReceipt("swift build", "Compiling...\nBuild complete! (1.23s)", 0, T);
  expect(swiftOk).toMatchObject({ tool: "swift build", fail: 0 });

  const swiftFail = classifyReceipt("swift build", "/path/File.swift:3:1: error: expected expression", 1, T);
  expect(swiftFail).toMatchObject({ tool: "swift build", fail: 1 });
});
