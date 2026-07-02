/**
 * Tests for curateLessons: strict-dedup (newest kept, TRIGGERS preserved),
 * STALE report on a vanished cited path, and the byte-identical no-op invariant.
 */
import { test, expect } from "bun:test";
import { curateLessons } from "../src/runtime/lifecycle/aipilot/curate-lessons";

const NOW = Date.UTC(2026, 6, 3); // 2026-07-03, matches the recent bullets below
const ABSENT_ROOT = "/nonexistent-curate-root-xyz"; // makes every cited path missing

test("strict dedup: near-identical bullets collapse to the most recent, fusion reported", () => {
  const input =
    "# LESSON.md\n\n" +
    "- [2026-06-02 11:00] sniper idle sans livrer le rapport attendu au lead final\n" +
    "- [2026-06-01 10:00] sniper idle sans livrer le rapport attendu au lead final absolument\n";
  const { content, report } = curateLessons(input, NOW, ABSENT_ROOT);
  expect(content).toContain("2026-06-02 11:00");
  expect(content).not.toContain("2026-06-01 10:00");
  expect(report).toContain("fusion");
});

test("TRIGGERS preserved: the kept (newest) block re-emits its continuation line verbatim", () => {
  const input =
    "# LESSON.md\n\n" +
    "- [2026-06-02 11:00] doublon sniper idle livraison rapport lead final\n" +
    "  [TRIGGERS sniper, idle, rapport]\n" +
    "- [2026-06-01 10:00] doublon sniper idle livraison rapport lead final\n";
  const { content } = curateLessons(input, NOW, ABSENT_ROOT);
  expect(content).toContain("[TRIGGERS sniper, idle, rapport]");
  expect(content).not.toContain("2026-06-01 10:00");
});

test("TRIGGERS carry-over: when the kept (newest) twin lacks the tag, it is carried from the dropped one", () => {
  const input =
    "# LESSON.md\n\n" +
    "- [2026-06-02 11:00] carry sniper idle livraison rapport lead final\n" +
    "- [2026-06-01 10:00] carry sniper idle livraison rapport lead final\n" +
    "[TRIGGERS sniper, idle]\n";
  const { content } = curateLessons(input, NOW, ABSENT_ROOT);
  expect(content).toContain("2026-06-02 11:00");
  expect(content).not.toContain("2026-06-01 10:00");
  expect(content).toContain("[TRIGGERS sniper, idle]"); // index preserved on the kept bullet
});

test("STALE report: a >90d bullet whose only cited path is gone is flagged (not removed)", () => {
  const input =
    "# LESSON.md\n\n" +
    "- [2020-01-01 00:00] ancienne leçon référant `src/gone/missing.ts` disparu\n";
  const { content, report } = curateLessons(input, NOW, ABSENT_ROOT);
  expect(report).toContain("[STALE?]");
  expect(report).toContain("src/gone/missing.ts");
  expect(content).toBe(input); // report-only: content untouched, nothing removed
});

test("no-op: distinct bullets leave content byte-identical and report empty", () => {
  const input =
    "# LESSON.md\n\n" +
    "- [2026-06-01 10:00] alpha beta gamma delta unique premier sujet\n" +
    "- [2026-06-02 11:00] omega sigma theta kappa distinct second sujet\n";
  const { content, report } = curateLessons(input, NOW, ABSENT_ROOT);
  expect(content).toBe(input);
  expect(report).toBe("");
});
