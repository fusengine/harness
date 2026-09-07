/**
 * @module receipt-runners-parse-static
 * Pass/fail count parsers for {@link RunnerSpec.counts} (`./receipt-runners`)
 * covering STATIC checkers (`kind: "tsc"` — the literal is historical, it now
 * means "static check"). Split out of `./receipt-runners-parse` (test-runner
 * formats) to keep both files under the SOLID line ceiling. Each returns
 * `{ pass?, fail? }` — `undefined` `fail` means "not reported" (exit code
 * alone decides); a defined `fail` (0 or more) means the OUTPUT itself proved
 * a pass/fail count, closing the "masked exit code" gap (`tsc ... | head`,
 * `go vet` piped through a filter) where `exitCode` alone can lie.
 */

/**
 * Marker-first static-checker contract shared by mypy/phpstan: `fail: 0`
 * when `successRe` matches; else the diagnostic count when `countRe`
 * matches; else `undefined` (no positive evidence).
 */
function markerOrCount(output: string, successRe: RegExp, countRe: RegExp): { fail?: number } {
  if (successRe.test(output)) return { fail: 0 };
  const m = output.match(countRe);
  return { fail: m ? Number(m[1]) : undefined };
}

/** mypy — `Found N errors` or `Success: no issues found`. */
export function parseMypy(output: string): { pass?: number; fail?: number } {
  return markerOrCount(output, /Success: no issues found/, /Found (\d+) errors?/);
}

/**
 * pyright — `N errors, M warnings, K informations`, but the `warnings` clause
 * is not required to recognise the error count (`1 error ` alone, e.g. under
 * `--outputjson` or a truncated summary, still parses).
 */
export function parsePyright(output: string): { pass?: number; fail?: number } {
  const m = output.match(/(\d+) errors?\b/);
  return { fail: m ? Number(m[1]) : undefined };
}

/** phpstan — `[ERROR] Found N errors` or `[OK]`. */
export function parsePhpstan(output: string): { pass?: number; fail?: number } {
  return markerOrCount(output, /\[OK\]/, /\[ERROR\] Found (\d+) errors?/);
}

/**
 * Diagnostic-count-first static-checker contract shared by tsc/go vet/go
 * build/cargo check/clippy: `fail` = the count of `diagnosticRe` matches
 * when present; else `0` only when `isClean(output)` holds (truly empty
 * output, or the tool's own success banner); else `undefined` (no positive
 * evidence).
 */
function diagnosticsOrClean(output: string, diagnosticRe: RegExp, isClean: (output: string) => boolean): { fail?: number } {
  const m = output.match(diagnosticRe);
  if (m) return { fail: m.length };
  return { fail: isClean(output) ? 0 : undefined };
}

/**
 * tsc — SILENT ON SUCCESS: no summary line at all. `fail` is a POSITIVE
 * signal only — the diagnostic count when `error TSxxxx:` lines are present,
 * `0` only when the output is truly EMPTY (after trim), else `undefined`
 * (D1/D2: `tsc --version`'s banner, a Node crash trace, or any other
 * non-empty non-diagnostic text proves nothing was actually type-checked —
 * `classifyReceipt`'s {@link isSuppressed} already nulls a piped/redirected
 * invocation outright, closing the "masked exit + truncated output" gap this
 * used to paper over with a bare `fail: 0` default).
 */
export function parseTsc(output: string): { pass?: number; fail?: number } {
  return diagnosticsOrClean(output, /\berror TS\d+:/g, (o) => o.trim() === "");
}

/**
 * `go vet` / `go build` — SILENT ON SUCCESS, same positive-evidence contract
 * as {@link parseTsc}: diagnostic count when present, `0` only on truly
 * empty output, else `undefined`.
 */
export function parseGoStatic(output: string): { pass?: number; fail?: number } {
  return diagnosticsOrClean(output, /^(?:#\s|vet:\s|.+\.go:\d+:\d+:)/gm, (o) => o.trim() === "");
}

/**
 * `cargo check` / `cargo clippy` — fail = count of `error[Exxxx]:`/`error:`
 * lines when present; otherwise `0` ONLY on cargo's own success banner
 * (`Finished …`), else `undefined` (D1: `cargo clippy --version`'s banner
 * has neither an error line nor `Finished`, so it proves nothing). Cargo
 * right-aligns status verbs to 12 columns, so the REAL banner is
 * `    Finished \`dev\` profile [...] target(s) in 0.02s` — 4 leading
 * spaces, never bare `Finished` at column 0.
 */
export function parseCargoStatic(output: string): { pass?: number; fail?: number } {
  return diagnosticsOrClean(output, /^error(?:\[E\d+\])?:/gm, (o) => /^\s*Finished\b/m.test(o));
}

/**
 * `swift build` — `Build complete!` on success (`fail: 0`); diagnostic count
 * when `error: ` lines are present; otherwise `undefined` (D1: `swift build
 * --help`'s usage text has neither, so it proves nothing).
 */
export function parseSwiftBuild(output: string): { pass?: number; fail?: number } {
  if (/Build complete!/.test(output)) return { fail: 0 };
  const m = output.match(/(?:^|\s)error:\s/gm);
  return { fail: m ? m.length : undefined };
}
