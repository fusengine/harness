import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { guard } from "../../src/adapters/claude";
import { CASES, bashInput, tsDecision } from "./fixtures";

/**
 * Golden-snapshot non-regression net (CI-safe — no Python reference needed).
 * Locks the exact native Claude response the harness emits for each curated
 * payload; any drift fails here. Regenerate after an INTENTIONAL policy change:
 *   bun run test/parity/gen-golden.ts
 * This gives a measurable behavioural guarantee even where the Python↔TS
 * differential (differential.test.ts) cannot run.
 */
const GOLDEN = JSON.parse(
  readFileSync(join(import.meta.dir, "golden.snapshot.json"), "utf-8"),
) as Record<string, string | null>;

test("normalized verdict matches each case's declared expectation", () => {
  for (const kase of CASES) {
    expect(tsDecision(bashInput(kase.command))).toBe(kase.expected);
  }
});

test("Claude adapter output matches the committed golden snapshot", () => {
  const current: Record<string, string | null> = {};
  for (const kase of CASES) current[kase.name] = guard(bashInput(kase.command));
  expect(current).toEqual(GOLDEN);
});
