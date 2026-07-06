/**
 * @module test/sim/run-scenario
 * Orchestrate one scenario end-to-end against the real harness binary. The glue
 * test (`simulator.test.ts`) imports {@link runScenario} and iterates the JSON
 * files under `scenarios/`.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { loadScenario, substitute } from "./load";
import { runHook, spawnEnv } from "./exec";
import { matchExit, matchStdout } from "./match";
import type { SetupFile, Step, SpawnResult } from "./types";

/** Absolute path to `test/sim/fixtures`, resolved from this file. */
const FIXTURES: string = join(import.meta.dir, "fixtures");

/**
 * Materialize each declared setup file under `$TMP` before any step runs, so the
 * spawned binary finds the on-disk state it needs (e.g. `.git`/`package.json`
 * project markers that `projectRootOrNull` walks up to). Each path is token-
 * substituted and containment-checked: it MUST resolve inside `tmp`, so a typo'd
 * scenario can never write outside the per-run sandbox.
 * @throws Error when a resolved path escapes `tmp`.
 */
function materializeSetup(setup: SetupFile[], tmp: string, vars: Record<string, string>): void {
  for (const raw of setup) {
    const f = substitute(raw, vars);
    const abs = resolve(f.path);
    if (abs !== tmp && !abs.startsWith(tmp + sep)) throw new Error(`setup path escapes $TMP: ${f.path}`);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.content);
  }
}

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
  // Harness id spawned as `hook <harness> <scope>`; defaults to claude-code so
  // legacy scenarios (no `harness` key) spawn byte-identically to before.
  const harness = scenario.harness ?? "claude-code";
  materializeSetup(scenario.setup ?? [], tmp, vars);
  for (const [i, rawStep] of scenario.steps.entries()) {
    const step = substitute(rawStep, vars);
    // Real wall-clock gap so a time-window guard in the binary (burst dedup)
    // reads this step as a genuine retry, not a same-event sibling hook.
    if (step.delayMs && step.delayMs > 0) await Bun.sleep(step.delayMs);
    const res = runHook(harness, step.scope, step.event, tmp, env);
    const failure = checkStep(step, res);
    if (failure) {
      throw new Error(
        `scenario "${scenario.name}" step ${i + 1} (scope=${step.scope}): ${failure}` +
          `\n  exit: ${res.exit}\n  stdout: ${JSON.stringify(res.stdout)}\n  stderr: ${res.stderr}`,
      );
    }
  }
}
