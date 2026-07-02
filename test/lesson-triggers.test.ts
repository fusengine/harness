import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseLessons } from "../src/policy/lessons/trigger-index";
import { lessonFor } from "../src/policy/lessons/lesson-gate";
import type { OncePerWindow } from "../src/policy/lessons/types";

/** Write a LESSON.md into a fresh temp dir and return its path. */
function lessonFile(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "fh-lesson-"));
  const file = join(dir, "LESSON.md");
  writeFileSync(file, body);
  return file;
}

/** `once` stub that always allows (no cooldown). */
const always: OncePerWindow = () => true;

const TOOL_LESSON = `# LESSON.md
- [2026-07-03 10:00] Editing gate.ts broke file-size → recount lines first.
[TRIGGERS tool:Write,Edit path:src/**/*.ts keyword:file-size]

- [2026-07-03 09:00] A plain lesson with no triggers, stays in the block.
`;

test("parseLessons: only triggered bullets are indexed, text compacted", () => {
  const entries = parseLessons(TOOL_LESSON);
  expect(entries.length).toBe(1);
  const [entry] = entries;
  if (!entry) throw new Error("expected exactly one triggered entry");
  expect(entry.triggers.tools).toEqual(["Write", "Edit"]);
  expect(entry.triggers.paths).toEqual(["src/**/*.ts"]);
  expect(entry.triggers.keywords).toEqual(["file-size"]);
  expect(entry.text).toContain("recount lines first");
  expect(entry.text).not.toContain("[TRIGGERS");
});

test("lessonFor: exact tool match injects an inform (never blocks)", () => {
  const file = lessonFile(TOOL_LESSON);
  const p = lessonFor("Write", { file_path: "x.py" }, { file, once: always });
  expect(p).not.toBeNull();
  expect(p?.kind).toBe("inform");
  expect(p?.reason).toContain("recount lines first");
});

test("lessonFor: no matching predicate → null (no injection)", () => {
  const file = lessonFile(TOOL_LESSON);
  const p = lessonFor("Read", { file_path: "README.md" }, { file, once: always });
  expect(p).toBeNull();
});

test("lessonFor: untriggered lesson is ignored by the gate", () => {
  const file = lessonFile(`# L\n- [2026-07-03] no trigger here → do X.\n`);
  expect(lessonFor("Write", { file_path: "a.ts" }, { file, once: always })).toBeNull();
});

test("lessonFor: path glob matches when tool does not", () => {
  const file = lessonFile(`# L\n- [d] path rule → do X.\n[TRIGGERS path:*.test.ts]\n`);
  expect(lessonFor("Read", { file_path: "a/b/foo.test.ts" }, { file, once: always })).not.toBeNull();
  expect(lessonFor("Read", { file_path: "a/b/foo.ts" }, { file, once: always })).toBeNull();
});

test("lessonFor: error regex matches a prior error", () => {
  const file = lessonFile(`# L\n- [d] err rule → do X.\n[TRIGGERS error:ENOENT|not found]\n`);
  expect(lessonFor("Bash", {}, { file, once: always, prevError: "Error: file not found" })).not.toBeNull();
  expect(lessonFor("Bash", {}, { file, once: always })).toBeNull();
});

test("lessonFor: keyword matches against the tool_input JSON", () => {
  const file = lessonFile(`# L\n- [d] kw rule → do X.\n[TRIGGERS keyword:git push]\n`);
  expect(lessonFor("Bash", { command: "git push origin main" }, { file, once: always })).not.toBeNull();
});

test("lessonFor: tool beats keyword when both could match (specificity)", () => {
  const file = lessonFile(
    `# L\n- [d] tool one → A.\n[TRIGGERS tool:Bash]\n\n- [d] kw one → B.\n[TRIGGERS keyword:Bash]\n`,
  );
  const p = lessonFor("Bash", { command: "echo Bash" }, { file, once: always });
  expect(p?.reason).toContain("tool one");
});

test("lessonFor: cooldown suppresses the repeated lesson", () => {
  const file = lessonFile(TOOL_LESSON);
  const seen = new Set<string>();
  const oncePerWindow: OncePerWindow = (key) => (seen.has(key) ? false : (seen.add(key), true));
  expect(lessonFor("Write", { file_path: "x.ts" }, { file, once: oncePerWindow })).not.toBeNull();
  expect(lessonFor("Write", { file_path: "x.ts" }, { file, once: oncePerWindow })).toBeNull();
});
