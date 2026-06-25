/**
 * SubagentStart (matcher "") for the ai-pilot scope: inject cached lessons
 * (known project issues) into every agent. Ports `lessons-cache-inject.ts`.
 */
import { homedir } from "node:os";
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { contextResponse } from "../../../adapters/claude";
import { cacheDirFor, projectHash } from "./cache-base";
import { logCacheEvent } from "./analytics";
import { detectStack } from "./source-scan";
import { aggregateLocalLessons, loadGlobalLessons, mergeLessons } from "./lessons";
import type { LessonEntry } from "./types";

const MAX_AGE_MS = 30 * 86_400_000;
const MAX_LESSONS = 10;

/** Remove JSON files older than 30 days from `dir` (best effort). */
function pruneOldFiles(dir: string, now: number): void {
  try {
    const cutoff = now - MAX_AGE_MS;
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const path = `${dir}/${f}`;
      try { if (statSync(path).mtimeMs < cutoff) unlinkSync(path); } catch { /* skip */ }
    }
  } catch { /* dir may not exist */ }
}

/** Render lessons as a numbered known-issues list. */
function formatLessonList(lessons: LessonEntry[]): string {
  return lessons.map((l, i) => {
    const code = l.code?.line?.length ? `\n     Code: ${l.code.line.join(" | ").slice(0, 200)}` : "";
    return `${i + 1}. [${l.count}x] | ${l.pattern ?? "unknown"} -> ${l.fix ?? "see docs"}${code}`;
  }).join("\n");
}

/**
 * SubagentStart lessons injection: aggregate local + global lessons, or "".
 * @param cwd - Fallback project root (uses `CLAUDE_PROJECT_DIR` first).
 * @param home - Home dir (defaults to `~`).
 * @param now - Clock (defaults to `Date.now()`).
 * @returns The native hook stdout (possibly empty).
 */
export async function injectLessonsCache(cwd: string, home: string = homedir(), now: number = Date.now()): Promise<string> {
  const projectPath = process.env.CLAUDE_PROJECT_DIR ?? cwd;
  const pHash = projectHash(projectPath);
  const cacheDir = cacheDirFor("lessons", projectPath, home);
  const stack = detectStack(projectPath);

  pruneOldFiles(cacheDir, now);
  let localLessons: LessonEntry[] = [];
  try { localLessons = await aggregateLocalLessons(cacheDir); } catch { /* none */ }
  const globalLessons = await loadGlobalLessons(stack, home);
  if (localLessons.length === 0 && globalLessons.length === 0) return "";

  const merged = mergeLessons(localLessons, globalLessons).slice(0, MAX_LESSONS);
  if (merged.length === 0) return "";
  logCacheEvent("lessons", "hit", pHash, { count: merged.length, stack }, home);

  const ctx = `## KNOWN PROJECT ISSUES (from previous sniper validations)\nThese errors have been found and fixed before. AVOID them:\n${formatLessonList(merged)}\n\nINSTRUCTION: Check your code against these known issues BEFORE submitting.`;
  return contextResponse("SubagentStart", ctx);
}
