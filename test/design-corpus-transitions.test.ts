import { test, expect } from "bun:test";
import { recordCorpusRead, recordScreenshot, recordRead, recordValidDesignSystem } from "../src/policy/design/transitions";
import { initDesignState, type DesignState, type DesignMode } from "../src/policy/design/state";

const st = (mode: DesignMode, over: Partial<DesignState> = {}): DesignState =>
  ({ ...initDesignState("a", mode, false), currentPhase: 1, ...over });

test("recordCorpusRead: distinct reads only — re-reading the same file does not inflate", () => {
  let s = recordCorpusRead(st("component"), "README.md", true);
  s = recordCorpusRead(s, "README.md", true);
  expect(s.corpusReads).toEqual(["README.md"]);
});

test("component: one corpus read alone is not enough — one screenshot is always required", () => {
  let s = recordCorpusRead(st("component"), "umbrel-recode/tokens-umbrel.md", true);
  expect(s.currentPhase).toBe(1);
  s = recordScreenshot(s, true);
  expect(s.currentPhase).toBe(2);
});

test("page: two distinct corpus reads plus one screenshot open phase 2", () => {
  let s = recordCorpusRead(st("page"), "README.md", true);
  s = recordCorpusRead(s, "fora-recode/tokens-fora.md", true);
  expect(s.currentPhase).toBe(1); // reads alone never open phase 2
  s = recordScreenshot(s, true);
  expect(s.currentPhase).toBe(2);
});

test("page: one corpus read plus one screenshot is not enough", () => {
  let s = recordCorpusRead(st("page"), "README.md", true);
  s = recordScreenshot(s, true);
  expect(s.currentPhase).toBe(1);
});

test("full: corpus alone is not enough — the 2-screenshot quota still applies", () => {
  let s = st("full");
  for (const r of ["README.md", "a-recode/tokens-a.md", "b-recode/tokens-b.md"]) s = recordCorpusRead(s, r, true);
  expect(s.currentPhase).toBe(1);
  s = recordScreenshot(s, true);
  expect(s.currentPhase).toBe(1);
  s = recordScreenshot(s, true);
  expect(s.currentPhase).toBe(2);
});

test("monotonic: a corpus Read after phase 3 never downgrades currentPhase", () => {
  let s = recordValidDesignSystem(st("page", { currentPhase: 2 }));
  expect(s.currentPhase).toBe(3);
  s = recordCorpusRead(s, "README.md", true);
  expect(s.currentPhase).toBe(3);
});

test("waived vs required is DISCRIMINANT: the same state opens phase 2 only when the corpus requirement is lifted", () => {
  const s = st("page", { screenshotsCount: 1 });
  expect(recordScreenshot(s, false).currentPhase).toBe(2); // fallback quota (2) met, corpus waived
  expect(recordScreenshot(s, true).currentPhase).toBe(1); // corpus reads missing
  const read = recordCorpusRead(recordCorpusRead(s, "README.md", true), "a-recode/tokens-a.md", true);
  expect(recordScreenshot(read, true).currentPhase).toBe(2); // corpus + screenshot
});

test("waived (corpus absent): screenshots alone decide, exactly like today", () => {
  expect(recordScreenshot(st("page", { screenshotsCount: 1 }), false).currentPhase).toBe(2);
  expect(recordScreenshot(st("component"), false).currentPhase).toBe(2);
  expect(recordScreenshot(st("full", { screenshotsCount: 3 }), false).currentPhase).toBe(2);
  expect(recordRead(st("page"), "/x/design-inspiration.md", false).currentPhase).toBe(1); // no free pass
});
