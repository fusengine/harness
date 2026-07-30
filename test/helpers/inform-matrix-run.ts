/**
 * @module test/helpers/inform-matrix-run
 * Parent-side driver: builds the fixtures, spawns the capture child
 * (`capture-run.ts`) with an allowlisted env, parses its stdout, validates
 * portability, and cleans up. Never mutates the PARENT process's own
 * `process.env` — `bun test` runs every file sequentially in one shared
 * process, so a parent-side mutation would leak into the other ~180 test
 * files in the suite.
 */
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { buildFixtures, childEnv } from "./inform-matrix-env";
import { assertPortable } from "./inform-matrix";

/**
 * Run the full capture in an isolated child process and return the golden.
 * @returns The 32-cell golden map.
 */
export function runMatrix(): Record<string, string> {
  const paths = buildFixtures();
  const r = spawnSync("bun", ["run", join(import.meta.dir, "capture-run.ts")], {
    env: childEnv(paths),
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(`capture-run.ts exited ${String(r.status)}: ${r.stderr}`);
  }
  const cells = JSON.parse(r.stdout) as Record<string, string>;
  assertPortable(cells, paths.root);
  rmSync(paths.root, { recursive: true, force: true });
  return cells;
}
