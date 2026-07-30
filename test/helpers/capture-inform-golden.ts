/**
 * @module test/helpers/capture-inform-golden
 * Manual, one-shot script: run `bun run test/helpers/capture-inform-golden.ts`
 * to (re)write `test/fixtures/inform-matrix.golden.json` from the current
 * `src/` behavior.
 *
 * NEVER re-run this in the same commit as a behavior change to `renderInform`
 * (or anything it calls transitively). The golden is the WITNESS that the
 * pre-change code respected the zero-regression theorem's hypotheses — it
 * must be captured and committed BEFORE the change, as its own commit.
 * Regenerating it alongside the change makes the proof and the change
 * indistinguishable on review: a diff that "updates the golden" could just as
 * easily be hiding a real regression as reflecting an intentional new branch.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runMatrix } from "./inform-matrix-run";

const outDir = join(import.meta.dir, "..", "fixtures");
const outFile = join(outDir, "inform-matrix.golden.json");
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, `${JSON.stringify(runMatrix(), null, 2)}\n`);
console.log(`wrote ${outFile}`);
