/**
 * @module test/sim/exec
 * Spawn the real harness binary for one step and capture stdout + exit code.
 * The env is rebuilt from scratch (minimal + scrubbed) so a scenario's outcome
 * never depends on the machine's inherited `FUSE_*` variables.
 */
import { spawnSync } from "node:child_process";
import { isAbsolute, join, resolve } from "node:path";
import type { SpawnResult } from "./types";

/** Repo root, resolved from this file (`<repo>/test/sim/exec.ts`). */
const REPO_ROOT: string = join(import.meta.dir, "..", "..");

/**
 * Build the deterministic minimal spawn env: only `PATH` + `HOME`, plus
 * `FUSE_HARNESS_REFS` pointing at the fixtures refs dir, with the scenario's own
 * env overlaid last. No inherited `FUSE_*` leaks in because nothing is copied
 * from `process.env` beyond `PATH`.
 *
 * @param fixtures    - Absolute path to `test/sim/fixtures`.
 * @param home        - `HOME` for the spawn (the scenario's `$TMP`, so on-disk
 *                      session state is isolated per scenario and auto-cleaned).
 * @param scenarioEnv - Optional per-scenario env overlay (already substituted).
 * @returns The full env map handed to the child process.
 */
export function spawnEnv(fixtures: string, home: string, scenarioEnv?: Record<string, string>): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "",
    HOME: home,
    FUSE_HARNESS_REFS: join(fixtures, "refs"),
    ...(scenarioEnv ?? {}),
  };
}

/**
 * Spawn one hook invocation. Uses `bun src/cli/bin.ts` by default; when `SIM_BIN`
 * is set (CI post-build), uses `node $SIM_BIN` against the built binary instead.
 * A relative `SIM_BIN` is resolved against the repo root (never `cwd`, which is
 * the scenario's `$TMP`) so `node` finds it regardless of where `bun test` ran.
 *
 * @param harness - Harness id (3rd argv of the binary); selects the adapter.
 * @param scope   - Plugin scope (4th argv of the binary).
 * @param event   - Raw hook payload, JSON-stringified onto the child's stdin.
 * @param cwd     - Working directory for the child (the scenario's `$TMP`).
 * @param env     - Env map from {@link spawnEnv}.
 * @returns Captured stdout, exit code, and stderr.
 */
export function runHook(harness: string, scope: string, event: unknown, cwd: string, env: Record<string, string>): SpawnResult {
  const simBin = process.env.SIM_BIN;
  const cmd = simBin ? "node" : "bun";
  const bin = simBin ? (isAbsolute(simBin) ? simBin : resolve(REPO_ROOT, simBin)) : join(REPO_ROOT, "src", "cli", "bin.ts");
  const args = [bin, "hook", harness, scope];
  const r = spawnSync(cmd, args, { input: JSON.stringify(event), cwd, env, encoding: "utf8" });
  const stderr = (r.stderr ?? "") + (r.error ? `\n[spawn error] ${String(r.error)}` : "");
  return { stdout: r.stdout ?? "", exit: r.status ?? 1, stderr };
}
