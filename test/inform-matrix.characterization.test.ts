/**
 * @module test/inform-matrix.characterization
 * Zero-regression golden for `renderInform` and its three call sites
 * (`injectRules`, `dispatchLessons`, `promptSubmitContext`) across every
 * (harness id × hook event) combination.
 *
 * A diff on ANY cell other than `kimi × UserPromptSubmit` IS the regression:
 * the theorem this golden witnesses is `f'(x) = g(x) if P(x), f(x) otherwise`
 * ⟹ `∀x. ¬P(x) ⟹ f'(x) = f(x)` — every non-kimi/non-UserPromptSubmit cell is
 * an `x` where `¬P(x)` holds, so it MUST stay byte-identical. The golden is
 * never updated to make new code pass; see `capture-inform-golden.ts` for why.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runMatrix } from "./helpers/inform-matrix-run";

const goldenPath = join(import.meta.dir, "fixtures", "inform-matrix.golden.json");

describe("renderInform zero-regression matrix", () => {
  test("every (id x event x emitter) cell matches the captured golden", () => {
    const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as Record<string, string>;
    expect(runMatrix()).toEqual(golden);
  });
});
