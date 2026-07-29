import { test, expect } from "bun:test";
import { browserNavigateGate, designSystemWriteGate, geminiCreateGate } from "../src/policy/design/gates-pipeline";
import { htmlCssOnlyGate, stateFileGate, screenshotScrollGate, validateDesignSystem } from "../src/policy/design/gates";
import { initDesignState, type DesignState } from "../src/policy/design/state";

/**
 * Characterization tests: pin the behavior that must SURVIVE the inspiration-doctrine
 * rework untouched. Green before AND after the change — if one turns red, the
 * implementation moved something it was not supposed to.
 */
const st = (over: Partial<DesignState> = {}): DesignState => ({ ...initDesignState("a", "full", false), ...over });
const VALID = "## Design Reference\nInspiration: https://boulangerie-dupont.fr\n--a: oklch(0.62 0.19 250);\n--font: \"Fraunces\";";

test("navigate gate: phase 0 and inspiration prerequisite still deny", () => {
  expect(browserNavigateGate(st({ currentPhase: 0 }), "https://x.com")?.kind).toBe("block");
  expect(browserNavigateGate(st({ currentPhase: 1, inspirationRead: false }), "https://x.com")?.kind).toBe("block");
});

test("screenshot scroll guard unchanged", () => {
  expect(screenshotScrollGate(st({ scrolledSinceNav: false }))?.kind).toBe("block");
  expect(screenshotScrollGate(st({ scrolledSinceNav: true }))).toBeNull();
});

test("navigate gate scoping survives the catalog inversion: galleries pass in phase 1, any URL passes from phase 2", () => {
  const p1 = st({ currentPhase: 1, inspirationRead: true });
  expect(browserNavigateGate(p1, "https://awwwards.com/websites/x")).toBeNull();
  expect(browserNavigateGate(p1, "https://godly.website")).toBeNull();
  expect(browserNavigateGate(st({ currentPhase: 2, inspirationRead: true }), "https://boulangerie-dupont.fr")).toBeNull();
});

test("state-file and html/css-only guards unchanged", () => {
  expect(stateFileGate("/p/.design-state-a.json")?.kind).toBe("block");
  expect(stateFileGate("/p/other.md")).toBeNull();
  expect(htmlCssOnlyGate("src/components/x.tsx")?.kind).toBe("block");
  expect(htmlCssOnlyGate("src/components/x.md")).toBeNull();
});

test("gemini gate: phase >= 3 and validated design system still required", () => {
  expect(geminiCreateGate(st({ currentPhase: 2, designSystemValid: true }))?.kind).toBe("block");
  expect(geminiCreateGate(st({ currentPhase: 3, designSystemValid: false }))?.kind).toBe("block");
  expect(geminiCreateGate(st({ currentPhase: 3, designSystemValid: true }))).toBeNull();
});

test("write gate: still blocks at phase < 2 and below quota, allows above", () => {
  expect(designSystemWriteGate("other.md", st())).toBeNull();
  expect(designSystemWriteGate("design-system.md", st({ currentPhase: 1 }))?.kind).toBe("block");
  expect(designSystemWriteGate("design-system.md", st({ currentPhase: 2, mode: "full", screenshotsCount: 0 }))?.kind).toBe("block");
  expect(designSystemWriteGate("design-system.md", st({ currentPhase: 2, mode: "full", screenshotsCount: 99 }))).toBeNull();
});

test("validateDesignSystem: section, oklch chroma and forbidden-font checks survive", () => {
  expect(validateDesignSystem("no section https://x.com oklch(0.6 0.2 250)")).toContain("## Design Reference section");
  expect(validateDesignSystem("## Design Reference\nhttps://x.com")).toContain("oklch() color with chroma > 0");
  expect(validateDesignSystem(VALID)).toEqual([]);
});

test("forbidden fonts: a DECLARATION is caught, prose mention is allowed", () => {
  expect(validateDesignSystem(`${VALID}\n--font-body: "Inter", sans-serif;`)).toContain("forbidden font (Inter/Roboto/Arial/Open Sans)");
  expect(validateDesignSystem(`${VALID}\nfont-family: Roboto;`)).toContain("forbidden font (Inter/Roboto/Arial/Open Sans)");
  expect(validateDesignSystem(`${VALID}\n## Interaction states\nWe never use Inter here.`)).toEqual([]);
});

test("forbidden fonts: usage forms beyond one-line CSS declarations are caught", () => {
  const forms = [
    "font: 16px/1.5 Inter, sans-serif;",
    'fontFamily: "Inter"',
    "FONT-FAMILY: Inter;",
    "font-family:\n  Inter;",
    "@import url('https://fonts.googleapis.com/css2?family=Inter');",
    "| Body | Inter |",
  ];
  for (const form of forms) expect(validateDesignSystem(`${VALID}\n${form}`)).toContain("forbidden font (Inter/Roboto/Arial/Open Sans)");
});
