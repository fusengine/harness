/**
 * @module test/helpers/capture-run
 * Entry point of the CAPTURE CHILD PROCESS. Runs isolated from the parent
 * because Bun snapshots `$HOME` at process start — mutating
 * `process.env.HOME` in the parent process would NOT change what
 * `os.homedir()` returns there (measured on Bun 1.3.14). Spawning a fresh
 * process with `HOME` set in its own env is the only way to pin it.
 * Reads the fixture root from `MATRIX_ROOT` (never `process.argv`, since the
 * parent passes it via the child's env allowlist — see `childEnv`).
 */
import { pathsFor } from "./inform-matrix-env";
import { captureMatrix } from "./inform-matrix";

const root = process.env.MATRIX_ROOT;
if (!root) {
  console.error("capture-run: MATRIX_ROOT env var is required");
  process.exit(2);
}
process.stdout.write(JSON.stringify(captureMatrix(pathsFor(root))));
