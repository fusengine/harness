import { test, expect } from "bun:test";
import { citedCorpusRefs, citationJoinsReads, hasCorpusCitation } from "../src/policy/design/corpus";

const REAL = ["umbrel", "linear", "cursor", "harness", "xai", "mainframe", "reve", "endlesstools", "supercommon", "fora", "elysian"];

test("jointure: the ELEVEN real references join — both layouts, both naming conventions", () => {
  for (const s of REAL) {
    const dirRead = s === "elysian" ? "elysian/tokens-elysian.md" : `${s}-recode/tokens-${s}.md`;
    expect(citationJoinsReads(s, [dirRead])).toBe(true); // README convention (bare name), dir layout
    expect(citationJoinsReads(s, [`tokens-${s}.md`])).toBe(true); // bare name, flat layout
    if (s !== "elysian") {
      expect(citationJoinsReads(`${s}-recode`, [dirRead])).toBe(true); // dir convention, dir layout
      expect(citationJoinsReads(`${s}-recode`, [`tokens-${s}.md`])).toBe(true); // dir convention, flat layout
    }
  }
});

test("jointure: a reference never read never joins — widening must not reopen the forged door", () => {
  expect(citationJoinsReads("acme-corp", REAL.map((s) => `tokens-${s}.md`))).toBe(false);
  expect(citationJoinsReads("acme", ["acme-corp-recode/tokens-acme-corp.md"])).toBe(false); // near-miss stays out
  expect(citationJoinsReads("acme-corp", ["acme-recode/tokens-acme.md"])).toBe(false); // and the other direction
});

test("citation form: EVERY Corpus line is parsed — a ref cited on a second line joins too", () => {
  const content = "- Corpus: umbrel/## 4\n- Corpus: fora/## 2, reve/## 1";
  expect(citedCorpusRefs(content)).toEqual(["umbrel", "fora", "reve"]);
});

test("citation form: bare refs, asterisk bullets, lowercase corpus are recognized", () => {
  expect(citedCorpusRefs("- Corpus: reve")).toEqual(["reve"]);
  expect(citedCorpusRefs("* Corpus: umbrel/## 4. Colors, fora/## 2. Colors")).toEqual(["umbrel", "fora"]);
  expect(citedCorpusRefs("- corpus: reve/## 4. Colors")).toEqual(["reve"]);
});

test("citationJoinsReads: filename prefixes and README never join", () => {
  const reads = ["README.md", "tokens-a.md", "a-recode/tokens-a.md"];
  expect(citationJoinsReads("tokens", reads)).toBe(false); // would otherwise join EVERY tokens-*.md
  expect(citationJoinsReads("README", reads)).toBe(false); // the index names no reference
  expect(citationJoinsReads("a", reads)).toBe(true);
});

test("citationJoinsReads: -recode absorbed, unread ref rejected, flat layout joins", () => {
  const reads = ["README.md", "reve-recode/tokens-reve.md", "elysian/tokens-elysian.md"];
  expect(citationJoinsReads("reve", reads)).toBe(true);
  expect(citationJoinsReads("reve-recode", reads)).toBe(true);
  expect(citationJoinsReads("xai", reads)).toBe(false);
  expect(citationJoinsReads("b", ["tokens-b-recode.md"])).toBe(true);
});

test("hasCorpusCitation: a Corpus line with ref/section pairs, nothing else", () => {
  expect(hasCorpusCitation("- Corpus: umbrel/## 4. Colors, fora/## 2. Colors")).toBe(true);
  expect(hasCorpusCitation("Inspiration: https://example.com")).toBe(false);
  expect(hasCorpusCitation("some prose mentioning corpus/ nothing")).toBe(false);
});
