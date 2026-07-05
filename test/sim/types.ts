/**
 * @module test/sim/types
 * Scenario schema for the hook simulator. A scenario is a JSON file replayed
 * step-by-step against the real harness binary; the shape here is the contract
 * every `test/sim/scenarios/*.json` file is authored and validated against.
 */

/** A stdout expectation — exactly one matcher form per step. */
export type StdoutExpect =
  | { empty: true }
  | { contains: string }
  | { regex: string }
  | { jsonPath: string; equals: unknown };

/** What a step asserts about the spawn result (assert only the fields present). */
export interface StepExpect {
  /** Expected process exit code (skipped when absent). */
  exit?: number;
  /** Expected stdout matcher (skipped when absent). */
  stdout?: StdoutExpect;
}

/** One hook invocation: a `scope` (4th argv), a raw event on stdin, an assertion. */
export interface Step {
  /** Plugin scope passed as the binary's 4th argument (core/solid/rules/...). */
  scope: string;
  /** Raw Claude Code hook payload sent on stdin. */
  event: Record<string, unknown>;
  /** Assertions checked against the spawn result. */
  expect: StepExpect;
}

/** A file materialized under `$TMP` before any step runs (e.g. a project marker). */
export interface SetupFile {
  /** Absolute path (use the `$TMP` token); must resolve inside `$TMP`, parents auto-created. */
  path: string;
  /** File contents written verbatim (tokens substituted). */
  content: string;
}

/** A full scenario file: a name, an optional env overlay, setup files, and ordered steps. */
export interface Scenario {
  /** Human-readable scenario name (surfaced in failure messages). */
  name: string;
  /** Optional env overlay merged over the deterministic minimal spawn env. */
  env?: Record<string, string>;
  /** Files to create under `$TMP` before steps run — e.g. `.git`/`package.json` roots. */
  setup?: SetupFile[];
  /** Ordered steps sharing one `$TMP` (session state persists across them). */
  steps: Step[];
}

/** Result of spawning the harness binary for one step. */
export interface SpawnResult {
  /** Captured stdout (raw, un-trimmed). */
  stdout: string;
  /** Process exit code (1 when killed by a signal or spawn failed). */
  exit: number;
  /** Captured stderr plus any spawn error, for failure diagnostics. */
  stderr: string;
}
