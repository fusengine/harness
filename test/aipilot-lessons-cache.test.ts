import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promoteGlobalLessons } from "../src/runtime/lifecycle/aipilot/promote-global-lessons";
import { dispatchAipilot } from "../src/runtime/lifecycle/aipilot/dispatch-aipilot";
import { cacheDirFor, cacheBaseDir } from "../src/runtime/lifecycle/aipilot/cache-base";
import type { LessonEntry } from "../src/runtime/lifecycle/aipilot/types";

/** Build a single-error lesson file payload. */
function lessonFile(pattern: string): { errors: LessonEntry[] } {
  return { errors: [{ error_type: "code_fix", pattern, fix: "Fix code_fix", count: 1, last_seen: "t", files: ["a.ts"], code: { line: ["x"] } }] };
}

test("promoteGlobalLessons: count >= 3 writes _global/<stack>.json", async () => {
  const home = mkdtempSync(join(tmpdir(), "fh-glob-"));
  const cacheDir = mkdtempSync(join(tmpdir(), "fh-cache-"));
  for (let i = 0; i < 3; i++) writeFileSync(join(cacheDir, `${i}.json`), JSON.stringify(lessonFile("dup pattern")));

  await promoteGlobalLessons(cacheDir, "universal", "phash", home);

  const globalFile = join(cacheBaseDir(home), "lessons", "_global", "universal.json");
  expect(existsSync(globalFile)).toBe(true);
  const lessons = JSON.parse(readFileSync(globalFile, "utf8")) as Array<LessonEntry & { source_projects: string[] }>;
  expect(lessons[0]?.count).toBe(3);
  expect(lessons[0]?.source_projects).toContain("phash");
});

test("promoteGlobalLessons: count < 3 writes nothing", async () => {
  const home = mkdtempSync(join(tmpdir(), "fh-glob2-"));
  const cacheDir = mkdtempSync(join(tmpdir(), "fh-cache2-"));
  for (let i = 0; i < 2; i++) writeFileSync(join(cacheDir, `${i}.json`), JSON.stringify(lessonFile("rare pattern")));

  await promoteGlobalLessons(cacheDir, "universal", "phash", home);

  expect(existsSync(join(cacheBaseDir(home), "lessons", "_global", "universal.json"))).toBe(false);
});

test("dispatchAipilot SubagentStart sniper: receives lessons 'known issues' block", async () => {
  // `dispatchAipilot` now takes an injectable `home` (5th arg), so both the
  // per-project local cache AND the machine-wide `_global` lessons cache are
  // isolated under a throwaway home — no bleed from this machine's real
  // accumulated lessons (which would otherwise crowd out this test's single
  // low-count entry once merged + sorted by count).
  const project = mkdtempSync(join(tmpdir(), "fh-snipproj-"));
  const home = mkdtempSync(join(tmpdir(), "fh-sniphome-"));
  const prevProjDir = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = project;
  const cacheDir = cacheDirFor("lessons", project, home);
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, "a.json"), JSON.stringify(lessonFile("a known sniper issue")));
  try {
    const out = await dispatchAipilot("SubagentStart", { agent_type: "sniper" }, project, Date.now(), home);
    expect(out).toContain("KNOWN PROJECT ISSUES");
    expect(out).toContain("a known sniper issue");
  } finally {
    if (prevProjDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = prevProjDir;
  }
});
