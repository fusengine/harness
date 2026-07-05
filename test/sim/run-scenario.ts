/**
 * @module test/sim/run-scenario
 * Orchestrate one scenario end-to-end against the real harness binary. The glue
 * test (`simulator.test.ts`) imports {@link runScenario} and iterates the JSON
 * files under `scenarios/`.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadScenario, substitute } from "./load";
import { runHook, spawnEnv } from "./exec";
import { matchExit, matchStdout } from "./match";
import type { Step, SpawnResult } from "./types";

/** Absolute path to `test/sim/fixtures`, resolved from this file. */
const FIXTURES: string = join(import.meta.dir, "fixtures");

/** Check a step's result; return a failure string or `null` on pass. */
function checkStep(step: Step, res: SpawnResult): string | null {
  if (step.expect.exit !== undefined) {
    const m = matchExit(res.exit, step.expect.exit);
    if (m) return m;
  }
  if (step.expect.stdout) {
    const m = matchStdout(res.stdout, step.expect.stdout);
    if (m) return m;
  }
  return null;
}

/**
 * Load, substitute, and replay a scenario. Every step runs in the scenario's
 * fresh `$TMP` (shared across steps, so on-disk session state persists — the
 * block → comply → pass loop is exactly what this exercises). Throws with a
 * message naming the scenario, step index, expectation, and observed result on
 * the first divergence.
 *
 * @param path - Absolute path to a scenario JSON file.
 * @throws Error on a load/validation failure or any step assertion mismatch.
 */
export async function runScenario(path: string): Promise<void> {
  const scenario = loadScenario(path);
  const tmp = mkdtempSync(join(tmpdir(), "fh-sim-"));
  const vars = { TMP: tmp, FIXTURES };
  const env = spawnEnv(FIXTURES, tmp, substitute(scenario.env, vars));
  for (const [i, rawStep] of scenario.steps.entries()) {
    const step = substitute(rawStep, vars);
    const res = runHook(step.scope, step.event, tmp, env);
    const failure = checkStep(step, res);
    if (failure) {
      throw new Error(
        `scenario "${scenario.name}" step ${i + 1} (scope=${step.scope}): ${failure}` +
          `\n  exit: ${res.exit}\n  stdout: ${JSON.stringify(res.stdout)}\n  stderr: ${res.stderr}`,
      );
    }
  }
}
