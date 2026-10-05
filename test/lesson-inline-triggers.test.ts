/**
 * Trailing INLINE `[TRIGGERS …]` tag (same line as the bullet text): arming,
 * space-bearing keyword values, archive protection, dedup carry-over, injected
 * text — plus the zero-regression pins for the own-line form and untagged bullets.
 */
import { test, expect } from "bun:test";
import { parseLessons } from "../src/policy/lessons/trigger-index";
import { splitInlineTag } from "../src/policy/lessons/trigger-tag";
import { curateLessons } from "../src/runtime/lifecycle/aipilot/curate-lessons";
import { compressInjection, RECENT_FULL } from "../src/runtime/lifecycle/aipilot/lesson-inject";
import { hasTrigger, parse } from "../src/runtime/lifecycle/aipilot/lesson-parse";

const NOW = Date.UTC(2026, 6, 3);
const ABSENT_ROOT = "/nonexistent-inline-root-xyz";
const first = (c: string) => {
  const e = parseLessons(c)[0];
  if (!e) throw new Error("expected one armed entry");
  return e;
};

test("inline tag: a trailing [TRIGGERS …] arms the bullet and is stripped from its text", () => {
  const e = first("- [2026-09-05 13:30] deploie avant verdict → attendre. [TRIGGERS tool:Bash keyword:deploy,dist]\n");
  expect(e.triggers.tools).toEqual(["Bash"]);
  expect(e.triggers.keywords).toEqual(["deploy", "dist"]);
  expect(e.text).toBe("[2026-09-05 13:30] deploie avant verdict → attendre.");
});

test("inline tag: keyword values keep their spaces (cp -R, challenger en cours)", () => {
  const e = first("- [2026-09-05 13:30] x → y. [TRIGGERS keyword:déploie,cp -R,marketplace,node_modules,challenger en cours]\n");
  expect(e.triggers.keywords).toEqual(["déploie", "cp -R", "marketplace", "node_modules", "challenger en cours"]);
});

test("keywords: a value ends at the next ` <key>:` token", () => {
  const e = first("- [d] x → y. [TRIGGERS keyword:git push,rm -rf tool:Bash path:src/**/*.ts]\n");
  expect(e.triggers.keywords).toEqual(["git push", "rm -rf"]);
  expect(e.triggers.tools).toEqual(["Bash"]);
  expect(e.triggers.paths).toEqual(["src/**/*.ts"]);
});

test("inline tag: error regex stays a single token; balanced brackets do not end the tag early", () => {
  const e = first("- [d] x → y. [TRIGGERS error:ENOENT|EACCES keyword:a b]\n");
  expect(e.triggers.error).toBe("ENOENT|EACCES");
  expect(e.triggers.keywords).toEqual(["a b"]);
  expect(splitInlineTag("t [TRIGGERS error:E[A-Z]+ keyword:a b]")?.body).toBe("error:E[A-Z]+ keyword:a b");
});

test("own-line form is unchanged (predicates + compact text pinned)", () => {
  const e = first("- [2026-07-03 10:00] Editing gate.ts broke file-size → recount lines first.\n[TRIGGERS tool:Write,Edit path:src/**/*.ts keyword:file-size]\n");
  expect(e).toEqual({
    text: "[2026-07-03 10:00] Editing gate.ts broke file-size → recount lines first.",
    triggers: { tools: ["Write", "Edit"], paths: ["src/**/*.ts"], error: undefined, keywords: ["file-size"] },
  });
});

test("[TRIGGERS mid-sentence (not at the end) is NOT a tag", () => {
  expect(parseLessons("- [d] on ecrit [TRIGGERS keyword:foo] dans le texte, puis la suite.\n")).toEqual([]);
  expect(parseLessons("- [d] a [TRIGGERS keyword:foo] puis [voir x]\n")).toEqual([]);
  expect(splitInlineTag("sans espace[TRIGGERS keyword:foo]")).toBeNull();
});

test("tag-only bullet is not a tag; a tag wrapped over lines is seen alike by index, archive and injection", () => {
  expect(splitInlineTag("- [TRIGGERS keyword:a]")).toBeNull();
  expect(parseLessons("-  [TRIGGERS keyword:a]\n")).toEqual([]);
  const wrapped = "- [2026-06-01 10:00] x → une regle assez longue pour depasser le minimum de lecture. [TRIGGERS keyword:a,\n  b c]\n";
  expect(first(wrapped).triggers.keywords).toEqual(["a", "b c"]);
  expect(parse(wrapped).blocks.map(hasTrigger)).toEqual([true]);
  expect(parse("- [TRIGGERS keyword:a]\n").blocks.map(hasTrigger)).toEqual([false]);
  expect(compressInjection(wrapped, 0)).toBe("- [2026-06-01 10:00] une regle assez longue pour depasser le minimum de lecture.");
});

test("untagged bullet: never armed, injected text unchanged", () => {
  expect(parseLessons("- [d] plain lesson → do X.\n")).toEqual([]);
  expect(splitInlineTag("plain lesson → do X.")).toBeNull();
});

test("archive: a young inline-tagged bullet is protected past the cap", () => {
  const rows: string[] = [];
  for (let i = 0; i < 56; i++) {
    const day = new Date(Date.UTC(2026, 5, 20) - i * 86400000).toISOString().slice(0, 10);
    const tag = i === 55 ? " [TRIGGERS keyword:protectme,cp -R]" : "";
    rows.push(`- [${day} 10:00] sujet numero ${i} alpha${i} beta${i} gamma${i} delta${i}${tag}`);
  }
  const { content, archive } = curateLessons(`# LESSON.md\n\n${rows.join("\n")}\n`, NOW, ABSENT_ROOT);
  expect(content).toContain("protectme");
  expect(archive).not.toContain("protectme");
});

test("archive: an old (>90d) inline-tagged bullet is still archivable", () => {
  const rows = Array.from({ length: 55 }, (_v, i) => `- [2026-06-20 10:00] recent numero ${i} alpha${i} beta${i} gamma${i} delta${i}`);
  rows.push("- [2020-01-01 00:00] vieille regle oldkw unique zeta eta theta [TRIGGERS keyword:oldkw]");
  expect(curateLessons(`# LESSON.md\n\n${rows.join("\n")}\n`, NOW, ABSENT_ROOT).archive).toContain("oldkw");
});

test("dedup: a tag inline on the dropped twin is carried over inline (spaces kept) to the kept newest", () => {
  const input = "# LESSON.md\n\n" +
    "- [2026-06-02 11:00] sniper idle sans livrer le rapport attendu au lead final\n" +
    "- [2026-06-01 10:00] sniper idle sans livrer le rapport attendu au lead final absolument [TRIGGERS keyword:sniper,en attente]\n";
  const { content } = curateLessons(input, NOW, ABSENT_ROOT);
  expect(content).toContain("2026-06-02 11:00");
  expect(content).toContain("au lead final [TRIGGERS keyword:sniper,en attente]");
  expect(first(content).triggers.keywords).toEqual(["sniper", "en attente"]);
});

test("injection: an older inline-tagged bullet is compressed without its tag; untagged ones unchanged", () => {
  const rows = Array.from({ length: RECENT_FULL }, (_v, i) => `- [2026-06-${String(20 - i).padStart(2, "0")} 10:00] recent ${i} → regle ${i}`);
  rows.push("- [2026-06-01 10:00] vieux recit → une regle assez longue pour depasser le minimum de lecture. [TRIGGERS keyword:vieux]");
  rows.push("- [2026-05-31 10:00] autre recit → une autre regle assez longue pour depasser le minimum lisible.");
  const out = compressInjection(`# L\n\n${rows.join("\n")}\n`).split("\n");
  expect(out.at(-2)).toBe("- [2026-06-01 10:00] une regle assez longue pour depasser le minimum de lecture.");
  expect(out.at(-1)).toBe("- [2026-05-31 10:00] une autre regle assez longue pour depasser le minimum lisible.");
});

test("own-line tag: keyword values stay space-delimited exactly as before (zero regression)", () => {
  expect(first("- [d] x\n[TRIGGERS keyword:a event:Stop]\n").triggers.keywords).toEqual(["a"]);
  expect(first("- [d] x\n[TRIGGERS keyword:a,b see note]\n").triggers.keywords).toEqual(["a", "b"]);
  expect(first("- [d] x\n[TRIGGERS keyword:a, b tool:Bash]\n").triggers.keywords).toEqual(["a"]);
});

test("a `-\\t`/`-\\u00a0` tag-only line after a bullet arms nothing, exactly like before", () => {
  for (const sep of ["-\t", "- "]) expect(parseLessons(`- [2026-09-01 10:00] lesson A\n${sep}[TRIGGERS keyword:x]\n`)).toEqual([]);
});

test("index and curation agree on bullet boundaries (CRLF lone dash, `-\\t` bullet)", () => {
  for (const c of ["- A [TRIGGERS keyword:x]\r\n-\r\n", "- A\n-\tlesson B [TRIGGERS keyword:x]\n"]) {
    const tagged = parse(c).blocks.filter(hasTrigger).length;
    expect(parseLessons(c).length).toBe(tagged);
  }
  expect(first("- A\n-\tlesson B [TRIGGERS keyword:x]\n").text).toBe("lesson B");
});

test("inline tag followed by a footer line: neither armed nor archive-protected (index and curation agree)", () => {
  const c = "# L\n\n- [2026-06-01 10:00] recit → regle. [TRIGGERS keyword:foo]\n\n<!-- footer -->\n";
  expect(parseLessons(c)).toEqual([]);
  expect(parse(c).blocks.map(hasTrigger)).toEqual([false]);
});
