/**
 * @module test/sim/match
 * Matchers for a step's expectations. Each returns `null` on a pass or a
 * human-readable "expected X, got Y" string on a failure — the runner threads
 * that string into the thrown error so a red test names exactly what diverged.
 */
import type { StdoutExpect } from "./types";

/** Resolve a dotted `jsonPath` against a parsed value (array indices supported). */
function dig(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Compare an exit code. */
export function matchExit(actual: number, expected: number): string | null {
  return actual === expected ? null : `expected exit ${expected}, got ${actual}`;
}

/**
 * Assert stdout against a {@link StdoutExpect} matcher.
 *
 * @param actual - Raw captured stdout.
 * @param expect - One matcher form (empty/contains/regex/jsonPath).
 * @returns `null` on pass, else a failure description.
 */
export function matchStdout(actual: string, expect: StdoutExpect): string | null {
  if ("empty" in expect) {
    return actual.trim() === "" ? null : `expected empty stdout, got ${JSON.stringify(actual)}`;
  }
  if ("contains" in expect) {
    return actual.includes(expect.contains) ? null : `expected stdout to contain ${JSON.stringify(expect.contains)}, got ${JSON.stringify(actual)}`;
  }
  if ("regex" in expect) {
    return new RegExp(expect.regex).test(actual) ? null : `expected stdout to match /${expect.regex}/, got ${JSON.stringify(actual)}`;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(actual);
  } catch {
    return `expected JSON stdout for jsonPath "${expect.jsonPath}", got non-JSON ${JSON.stringify(actual)}`;
  }
  const got = dig(parsed, expect.jsonPath);
  return JSON.stringify(got) === JSON.stringify(expect.equals)
    ? null
    : `jsonPath "${expect.jsonPath}": expected ${JSON.stringify(expect.equals)}, got ${JSON.stringify(got)}`;
}
