import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { runScenario } from "./run-scenario";
import { validateScenario } from "./load";

/**
 * Absolute path to the scenario corpus directory (`test/sim/scenarios`).
 * Each `*.json` file is one hook-simulation scenario (schema in README.md).
 */
const SCENARIOS_DIR = join(import.meta.dir, "scenarios");

/**
 * Discover every `*.json` scenario file in {@link SCENARIOS_DIR}.
 *
 * Returns absolute paths sorted lexicographically for deterministic ordering.
 * When the corpus directory is absent — e.g. authored on a parallel branch —
 * returns `[]` so the suite skips cleanly. The `existsSync` guard is required
 * because {@link Glob.scanSync} throws `ENOENT` on a missing `cwd` rather than
 * yielding an empty iterable.
 *
 * @returns Sorted absolute paths to scenario JSON files.
 */
function discoverScenarios(): string[] {
  if (!existsSync(SCENARIOS_DIR)) return [];
  return [
    ...new Glob("*.json").scanSync({ cwd: SCENARIOS_DIR, absolute: true }),
  ].sort();
}

const scenarios = discoverScenarios();

// Guard: an absent corpus dir skips cleanly (authored on a parallel branch), but
// a PRESENT dir that yields zero `*.json` is a packaging accident — without this
// the whole suite would go silently green (describe.skipIf below skips too). This
// test runs unconditionally and only asserts when the dir actually exists.
test("scenario corpus is non-empty when present", () => {
  if (existsSync(SCENARIOS_DIR)) expect(scenarios.length).toBeGreaterThan(0);
});

// A malformed `stdout` matcher must be rejected at load time with a located,
// named error — not cast blindly to crash later inside matchStdout's jsonPath
// branch (`undefined.split`). Locks the load.ts validateStdout guard.
test("validateScenario rejects a malformed stdout matcher", () => {
  const bad = { name: "x", steps: [{ scope: "core", event: {}, expect: { stdout: { foo: 1 } } }] };
  expect(() => validateScenario(bad, "inline")).toThrow(/expect\.stdout must have one of/);
});

// Empty corpus (not yet on disk) → skipped block, never a red job.
describe.skipIf(scenarios.length === 0)("hook simulator", () => {
  for (const path of scenarios) {
    const name = basename(path, ".json");
    // runScenario throws on any expectation mismatch → the test fails.
    test(name, () => runScenario(path));
  }
});
