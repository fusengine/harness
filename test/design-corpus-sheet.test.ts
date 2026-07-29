import { test, expect } from "bun:test";
import { classifyCorpusRead } from "../src/policy/design/corpus";

/**
 * C6: a reference's `design-system.md` DIRECTION sheet (register, tone,
 * macrostructure, signature element) must credit a corpus read — it is the
 * fiche read to CHOOSE a reference, distinct from the tokens-*.md procedures.
 */
const ROOT = "/plugins/design-expert/skills/design-web/references/refs-design";

test("C6: <ref>/design-system.md under the corpus root credits as 'sheet'", () => {
  expect(classifyCorpusRead(`${ROOT}/elysian/design-system.md`, ROOT)).toBe("sheet");
  expect(classifyCorpusRead(`${ROOT}/umbrel-recode/design-system.md`, ROOT)).toBe("sheet");
});

test("C6: a design-system.md OUTSIDE the corpus root does not credit", () => {
  expect(classifyCorpusRead("/proj/design-system.md", ROOT)).toBeNull();
  expect(classifyCorpusRead("/tmp/scratch/refs-design/elysian/design-system.md", ROOT)).toBeNull();
});

test("C6 non-regression: README.md and tokens-*.md still credit as before", () => {
  expect(classifyCorpusRead(`${ROOT}/README.md`, ROOT)).toBe("index");
  expect(classifyCorpusRead(`${ROOT}/elysian/tokens-elysian.md`, ROOT)).toBe("tokens");
});
