import { test, expect } from "bun:test";
import { validateDesignSystem } from "../src/policy/design/gates";

const FORBIDDEN_FONT_MSG = "forbidden font (Inter/Roboto/Arial/Open Sans)";

/**
 * Change 2 only: any custom property (English-named or not) whose value
 * quotes a forbidden font name must be caught. The quote is the signal —
 * `--police-texte: "Inter"` has no English keyword to key off, so without
 * this branch it silently escaped detection. Real-world two-line fixture
 * below is inspired by the corpus's `linear-recode/styles.css` font-stack.
 */
test("quoted custom prop: two-line font-stack with a non-English name is caught", () => {
  const twoLine =
    '--police-texte: "Inter", "Inter Variable", "SF Pro Display", -apple-system,\n  BlinkMacSystemFont, sans-serif;';
  expect(validateDesignSystem(twoLine)).toContain(FORBIDDEN_FONT_MSG);
});

test("quoted custom prop: single-line non-English name is caught", () => {
  expect(validateDesignSystem('--police-texte: "Inter";')).toContain(FORBIDDEN_FONT_MSG);
});

test("quoted custom prop: all four forbidden names are caught", () => {
  const names = ["Inter", "Roboto", "Arial", "Open Sans"];
  for (const name of names) {
    expect(validateDesignSystem(`--police-texte: "${name}";`)).toContain(FORBIDDEN_FONT_MSG);
  }
});

test("regression: the existing unquoted English-keyword branch still catches --font-body: Inter", () => {
  expect(validateDesignSystem("--font-body: Inter")).toContain(FORBIDDEN_FONT_MSG);
});

test("quoted custom prop: an allowed font name is not flagged", () => {
  expect(validateDesignSystem('--police-texte: "Fraunces";')).not.toContain(FORBIDDEN_FONT_MSG);
});

test("accepted trade-off: a quoted PROSE mention in a non-keyword custom prop is also caught", () => {
  expect(validateDesignSystem(`--commentaire: "on n'utilise jamais Inter"`)).toContain(FORBIDDEN_FONT_MSG);
});
