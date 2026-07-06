import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { failureLessonContext } from "../src/runtime/lifecycle/failure-lesson";

/** A tmp project root carrying a package.json marker + an error-triggered lesson. */
function projectWithLesson(bullet: string): string {
  const root = mkdtempSync(join(tmpdir(), "fh-fl-"));
  writeFileSync(join(root, "package.json"), "{}");
  mkdirSync(join(root, "MEMORY"), { recursive: true });
  writeFileSync(join(root, "MEMORY", "LESSON.md"), bullet);
  return root;
}

test("failureLessonContext: injects the lesson whose error trigger matches the failure", () => {
  const root = projectWithLesson("- [2026-07-05 10:00] FAILLESSON comply with the gate, never retry verbatim\n[TRIGGERS error:EACCES]\n");
  const home = mkdtempSync(join(tmpdir(), "fh-home-"));
  const out = failureLessonContext(
    { tool_name: "Write", session_id: "s1", error: "EACCES: permission denied, open '/x'" },
    root, home, 1000, () => true,
  );
  expect(out).toContain("FAILLESSON");
});

test("failureLessonContext: no matching error trigger yields no injection", () => {
  const root = projectWithLesson("- [2026-07-05 10:00] FAILLESSON x\n[TRIGGERS error:EACCES]\n");
  const home = mkdtempSync(join(tmpdir(), "fh-home2-"));
  const out = failureLessonContext(
    { tool_name: "Write", session_id: "s2", error: "ENOENT: no such file" },
    root, home, 1000, () => true,
  );
  expect(out).toBe("");
});
