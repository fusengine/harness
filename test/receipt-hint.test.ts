import { test, expect } from "bun:test";
import { join } from "node:path";
import { receiptHint } from "../src/runtime/lifecycle/receipt-hint";

const CWD = "/repo";

/** Build an `exists` fn true only for the given files (paths relative to {@link CWD}). */
function fs(...relPaths: string[]): (p: string) => boolean {
  const set = new Set(relPaths.map((p) => join(CWD, p)));
  return (p: string) => set.has(p);
}

test("receiptHint: bun project with tsconfig → bun test + bunx tsc --noEmit", () => {
  const exists = fs("package.json", "bun.lock", "tsconfig.json");
  expect(receiptHint(CWD, ["a.ts"], exists)).toBe("Run bun test + bunx tsc --noEmit (exit 0, 0 failures), then re-complete.");
});

test("receiptHint: pnpm project without tsconfig → pnpm test only", () => {
  const exists = fs("package.json", "pnpm-lock.yaml");
  expect(receiptHint(CWD, ["a.ts"], exists)).toBe("Run pnpm test (exit 0, 0 failures), then re-complete.");
});

test("receiptHint: python project with mypy.ini → pytest + mypy", () => {
  const exists = fs("pyproject.toml", "mypy.ini");
  expect(receiptHint(CWD, ["a.py"], exists)).toBe("Run pytest + mypy (exit 0, 0 failures), then re-complete.");
});

test("receiptHint: python project with pyrightconfig.json → pytest + pyright", () => {
  const exists = fs("pyproject.toml", "pyrightconfig.json");
  expect(receiptHint(CWD, ["a.py"], exists)).toBe("Run pytest + pyright (exit 0, 0 failures), then re-complete.");
});

test("receiptHint: go.mod → go test ./... + go vet ./...", () => {
  const exists = fs("go.mod");
  expect(receiptHint(CWD, ["a.go"], exists)).toBe("Run go test ./... + go vet ./... (exit 0, 0 failures), then re-complete.");
});

test("receiptHint: Cargo.toml → cargo test + cargo check", () => {
  const exists = fs("Cargo.toml");
  expect(receiptHint(CWD, ["a.rs"], exists)).toBe("Run cargo test + cargo check (exit 0, 0 failures), then re-complete.");
});

test("receiptHint: composer + artisan → php artisan test", () => {
  const exists = fs("composer.json", "artisan");
  expect(receiptHint(CWD, ["a.php"], exists)).toBe("Run php artisan test (exit 0, 0 failures), then re-complete.");
});

test("receiptHint: composer + tests/Pest.php (no artisan) → vendor/bin/pest", () => {
  const exists = fs("composer.json", "tests/Pest.php");
  expect(receiptHint(CWD, ["a.php"], exists)).toBe("Run vendor/bin/pest (exit 0, 0 failures), then re-complete.");
});

test("receiptHint: composer + phpstan.neon → phpstan appended", () => {
  const exists = fs("composer.json", "phpstan.neon");
  expect(receiptHint(CWD, ["a.php"], exists)).toBe("Run vendor/bin/phpunit + vendor/bin/phpstan analyse (exit 0, 0 failures), then re-complete.");
});

test("receiptHint: Package.swift → swift test", () => {
  const exists = fs("Package.swift");
  expect(receiptHint(CWD, ["a.swift"], exists)).toBe("Run swift test (exit 0, 0 failures), then re-complete.");
});

test("receiptHint: pubspec.yaml with flutter key → flutter test", () => {
  const exists = fs("pubspec.yaml");
  const readText = (): string => "name: app\nflutter:\n  sdk: flutter\n";
  expect(receiptHint(CWD, ["lib/a.dart"], exists, readText)).toBe("Run flutter test (exit 0, 0 failures), then re-complete.");
});

test("receiptHint: pubspec.yaml without flutter key → dart test", () => {
  const exists = fs("pubspec.yaml");
  const readText = (): string => "name: app\n";
  expect(receiptHint(CWD, ["a.dart"], exists, readText)).toBe("Run dart test (exit 0, 0 failures), then re-complete.");
});

test("receiptHint: monorepo — no root marker, but api/go.mod matches modified api/main.go", () => {
  const exists = fs("api/go.mod");
  expect(receiptHint(CWD, ["api/main.go"], exists)).toBe("Run go test ./... + go vet ./... (exit 0, 0 failures), then re-complete.");
});

test("receiptHint: extension-only .py with no markers → pytest + mypy default", () => {
  const exists = fs();
  expect(receiptHint(CWD, ["a.py"], exists)).toBe("Run pytest + mypy (exit 0, 0 failures), then re-complete.");
});

test("receiptHint: nothing detected → the generic cross-language list", () => {
  const exists = fs();
  expect(receiptHint(CWD, ["a.txt"], exists)).toBe(
    "Run your test suite and static checker (bun test + tsc, pytest + mypy, go test + go vet, " +
      "cargo test + cargo check, phpunit/pest + phpstan, swift test, dart test) with exit 0 and 0 " +
      "failures, then re-complete.",
  );
});

test("receiptHint: multiple ecosystems combine with 'and'", () => {
  const exists = fs("pyproject.toml", "mypy.ini", "go.mod");
  expect(receiptHint(CWD, ["a.py", "a.go"], exists)).toBe(
    "Run pytest + mypy and go test ./... + go vet ./... (exit 0, 0 failures), then re-complete.",
  );
});

test("receiptHint: dedupes search dirs — 2000 files across 3 dirs call `exists` fewer than 100 times", () => {
  let calls = 0;
  const real = fs("pkg/go.mod");
  const exists = (p: string): boolean => {
    calls += 1;
    return real(p);
  };
  // Nested 2 levels deep so `searchDirs`' (first, second) pair collapses to
  // one of 3 shared subdirs (pkg/sub, api/sub, web/sub) regardless of the
  // 2000 distinct filenames — proving the Set dedupe, not just few inputs.
  const files: string[] = [];
  for (let i = 0; i < 2000; i += 1) {
    const dir = ["pkg", "api", "web"][i % 3];
    files.push(`${dir}/sub/file${i}.go`);
  }
  expect(receiptHint(CWD, files, exists)).toBe("Run go test ./... + go vet ./... (exit 0, 0 failures), then re-complete.");
  expect(calls).toBeLessThan(100);
});
