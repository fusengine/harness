/**
 * Stage-2 injection compression (lesson-inject.compressInjection) + the
 * cross-project isolation guarantee: dispatchLessons SessionStart injects ONLY
 * the current project's MEMORY/LESSON.md, never another project's under the same
 * HOME. Measures the actual char-shrink on a large synthetic file.
 */
import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compressInjection, RECENT_FULL } from "../src/runtime/lifecycle/aipilot/lesson-inject";
import { dispatchLessons } from "../src/runtime/lifecycle/lessons/dispatch";
import { lessonsFileFor } from "../src/runtime/lifecycle/lessons/state";

/** Build `n` distinct dated bullets, newest first, each `narrative → rule`. */
function bullets(n: number): string {
  const rows: string[] = [];
  for (let i = 0; i < n; i++) {
    const day = new Date(Date.UTC(2026, 5, 20) - i * 86400000).toISOString().slice(0, 10);
    rows.push(`- [${day} 10:00] recit long numero ${i} blabla contexte ${"detail narratif verbeux ".repeat(30)}alpha${i} beta${i} → regle actionnable numero ${i} RULE${i}`);
  }
  return `# LESSON.md — Lessons\n<!-- format doc -->\n\n${rows.join("\n")}\n`;
}

test("compressInjection: newest RECENT_FULL bullets stay verbatim, older collapse to rule after last →", () => {
  const out = compressInjection(bullets(20));
  expect(out).toContain("recit long numero 0 blabla contexte"); // bullet 0 (newest) verbatim
  expect(out).not.toContain("recit long numero 19 blabla"); // bullet 19 (old) narrative dropped
  expect(out).toContain("[2026-06-01 10:00] regle actionnable numero 19 RULE19"); // …kept as its rule line
});

test("compressInjection: a bullet without → falls back to its first sentence", () => {
  const input = "# LESSON.md\n\n" + Array.from({ length: RECENT_FULL + 1 }, (_v, i) =>
    `- [2026-06-${String(i + 1).padStart(2, "0")} 09:00] sujet ${i} un fait. deux phrase ignoree.`).join("\n") + "\n";
  const out = compressInjection(input);
  const last = out.split("\n").at(-1) ?? "";
  expect(last).toContain("sujet 10 un fait.");
  expect(last).not.toContain("deux phrase ignoree");
});

test("compressInjection: a bullet whose LAST → segment is a tiny aside keeps the longest rule, not the stub", () => {
  const older = Array.from({ length: RECENT_FULL }, (_v, i) => `- [2026-06-${String(i + 1).padStart(2, "0")} 09:00] filler bullet ${i}`);
  const patho = "- [2026-07-02 00:02] narrative context blah blah → always re-check git status before staging a shared batch commit → (cf. lecture).";
  const out = compressInjection("# LESSON.md\n\n" + [...older, patho].join("\n") + "\n");
  const last = out.split("\n").at(-1) ?? "";
  expect(last).toContain("always re-check git status before staging a shared batch commit"); // the dense clause, not the last arrow
  expect(last).not.toContain("(cf. lecture)."); // the old "text after LAST →" stub is gone
  expect(last.length).toBeGreaterThanOrEqual(40);
});

test("compressInjection: massive shrink on a large file (>70%)", () => {
  const input = bullets(120);
  const before = `Project lessons:\n${input}`.length;
  const after = `Project lessons:\n${compressInjection(input)}`.length;
  const ratio = 1 - after / before;
  expect(ratio).toBeGreaterThan(0.7);
});

test("isolation: dispatchLessons injects ONLY the current project's LESSON.md, never a sibling under the same HOME", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-home-"));
  process.env.HOME = home;
  const mk = (marker: string): string => {
    const root = mkdtempSync(join(home, "proj-"));
    writeFileSync(join(root, "package.json"), "{}");
    mkdirSync(join(root, "MEMORY"), { recursive: true });
    writeFileSync(lessonsFileFor(root), `- [2026-06-10 10:00] ${marker} secret unique ligne`);
    return root;
  };
  const a = mk("AAAPROJECT");
  const b = mk("BBBPROJECT");
  const outA = dispatchLessons("SessionStart", {}, a, Date.UTC(2026, 6, 3));
  expect(outA).toContain("AAAPROJECT");
  expect(outA).not.toContain("BBBPROJECT");
  const outB = dispatchLessons("SessionStart", {}, b, Date.UTC(2026, 6, 3));
  expect(outB).toContain("BBBPROJECT");
  expect(outB).not.toContain("AAAPROJECT");
});
