import { test, expect } from "bun:test";
import { FRAGMENT_CHAR_CAP, capFragment, budgetReport } from "../src/runtime/inject-budget";

test("capFragment: text at or under the cap is returned byte-identical (no-op)", () => {
  const short = "a".repeat(100);
  expect(capFragment("x", short)).toBe(short);
  const atCap = "a".repeat(FRAGMENT_CHAR_CAP);
  expect(capFragment("x", atCap)).toBe(atCap);
});

test("capFragment: over the cap → truncated at a line boundary, suffix present, total length <= cap", () => {
  // 200 lines of 100 chars each = 20_000 chars, well over the 8_000 cap.
  const lines = Array.from({ length: 200 }, (_, i) => `line-${i}-`.padEnd(100, "x"));
  const text = lines.join("\n");
  const out = capFragment("mylabel", text);
  expect(out.length).toBeLessThanOrEqual(FRAGMENT_CHAR_CAP);
  expect(out).toContain("[truncated mylabel: kept ");
  expect(out).toContain(" of " + text.length + " chars — source file unchanged]");
  // Cut at a line boundary: the kept part (everything before the suffix line)
  // must be a strict, whole-line prefix of the original text.
  const suffixStart = out.lastIndexOf("\n[truncated");
  const kept = out.slice(0, suffixStart);
  expect(text.startsWith(kept)).toBe(true);
});

test("capFragment: a single fragment with no newline still respects the cap (hard cut fallback)", () => {
  const text = "x".repeat(20_000);
  const out = capFragment("nolines", text);
  expect(out.length).toBeLessThanOrEqual(FRAGMENT_CHAR_CAP);
  expect(out).toContain("[truncated nolines: kept ");
});

test("capFragment: a pathologically long label can never push the output past the cap", () => {
  const out = capFragment("L".repeat(10_000), "x".repeat(20_000));
  expect(out.length).toBeLessThanOrEqual(FRAGMENT_CHAR_CAP);
});

test("budgetReport: recap line with fragment count + total size in k chars", () => {
  expect(budgetReport([{ label: "Git", chars: 200 }, { label: "Version", chars: 100 }]))
    .toBe("injected 2 fragments, 0.3k chars");
  expect(budgetReport([{ label: "Big", chars: 14_200 }])).toBe("injected 1 fragments, 14.2k chars");
});

test("budgetReport: empty fragment list", () => {
  expect(budgetReport([])).toBe("injected 0 fragments");
});
