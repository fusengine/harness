import { test, expect } from "bun:test";
import { CASES, bashInput, tsDecision } from "./fixtures";
import { pyBashDecision, pythonRefAvailable, PY_ROOT } from "./py-runner";

/**
 * Real Python↔TS differential harness (ROADMAP "Harnais de test différentiel
 * Python↔TS"). Every curated Bash payload is sent to BOTH the TS harness and the
 * Python `core-guards` guard chain; their verdicts must be identical. Runs only
 * when the Python reference is present locally (override its location with
 * FUSE_PARITY_PYTHON_ROOT). In CI the reference is absent so this suite SKIPS —
 * the golden-snapshot suite (golden.test.ts) is the CI-safe non-regression net.
 */
const available = pythonRefAvailable();

test.skipIf(!available)(
  `TS verdict == Python core-guards verdict for every curated case (ref: ${PY_ROOT})`,
  () => {
    const mismatches: string[] = [];
    for (const kase of CASES) {
      const ts = tsDecision(bashInput(kase.command));
      const py = pyBashDecision(kase.command);
      if (ts !== py || ts !== kase.expected) {
        mismatches.push(`${kase.name}: expected=${kase.expected} ts=${ts} py=${py}`);
      }
    }
    expect(mismatches).toEqual([]);
  },
);
