/**
 * Tests for curateLessons: strict-dedup (newest kept, TRIGGERS preserved),
 * STALE report on a vanished cited path, the byte-identical no-op invariant, and
 * the Stage-1 cap→archive split (zero-loss + TRIGGERS staleness protection).
 */
import { test, expect } from "bun:test";
import { curateLessons } from "../src/runtime/lifecycle/aipilot/curate-lessons";

const NOW = Date.UTC(2026, 6, 3); // 2026-07-03, matches the recent bullets below
const ABSENT_ROOT = "/nonexistent-curate-root-xyz"; // makes every cited path missing

test("strict dedup: near-identical bullets collapse to the most recent, merge reported", () => {
  const input =
    "# LESSON.md\n\n" +
    "- [2026-06-02 11:00] sniper idle sans livrer le rapport attendu au lead final\n" +
    "- [2026-06-01 10:00] sniper idle sans livrer le rapport attendu au lead final absolument\n";
  const { content, report } = curateLessons(input, NOW, ABSENT_ROOT);
  expect(content).toContain("2026-06-02 11:00");
  expect(content).not.toContain("2026-06-01 10:00");
  expect(report).toContain("merged");
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
  const input = "# LESSON.md\n\n- [2020-01-01 00:00] ancienne leçon référant `src/gone/missing.ts` disparu\n";
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

/** `n` distinct dated bullets, newest first (index 0 = newest ts). */
function manyBullets(n: number): string {
  const rows = Array.from({ length: n }, (_v, i) => {
    const day = new Date(Date.UTC(2026, 5, 20) - i * 86400000).toISOString().slice(0, 10);
    return `- [${day} 10:00] sujet numero ${i} alpha${i} beta${i} gamma${i} delta${i} epsilon${i}`;
  });
  return `# LESSON.md\n\n${rows.join("\n")}\n`;
}
/** Count `- ` bullets in a rendered block. */
function count(md: string): number { return (md.match(/^- /gm) ?? []).length; }
test("cap→archive: over CAP moves the oldest excess out, ZERO loss (keep + archive == total)", () => {
  const { content, archive } = curateLessons(manyBullets(60), NOW, ABSENT_ROOT);
  expect(count(content)).toBe(50); // capped at CAP
  expect(count(content) + count(archive)).toBe(60); // nothing lost
  expect(content).toContain("alpha0"); // newest kept
  expect(content).not.toContain("alpha59"); // oldest moved out
  expect(archive).toContain("alpha59"); // …to the archive block
  for (const l of archive.split("\n").filter((x) => x.startsWith("- "))) expect(manyBullets(60)).toContain(l);
});
test("cap→archive: a young TRIGGERS bullet is protected past the cap; an old (>90d) one is archived", () => {
  const rows: string[] = [];
  for (let i = 0; i < 56; i++) {
    const day = new Date(Date.UTC(2026, 5, 20) - i * 86400000).toISOString().slice(0, 10);
    rows.push(`- [${day} 10:00] sujet numero ${i} alpha${i} beta${i} gamma${i} delta${i}`);
    if (i === 55) rows.push("  [TRIGGERS keyword:protectme]"); // oldest-by-index but < 90d
  }
  const young = curateLessons(`# LESSON.md\n\n${rows.join("\n")}\n`, NOW, ABSENT_ROOT);
  expect(young.content).toContain("[TRIGGERS keyword:protectme]"); // protected: stays in the file
  expect(young.archive).not.toContain("protectme");
  const old = "# LESSON.md\n\n" + manyBullets(55).split("\n").slice(2).join("\n") +
    "- [2020-01-01 00:00] vieille regle triggeree oldkw unique\n  [TRIGGERS keyword:oldkw]\n";
  expect(curateLessons(old, NOW, ABSENT_ROOT).archive).toContain("[TRIGGERS keyword:oldkw]"); // >90d IS archivable
});
