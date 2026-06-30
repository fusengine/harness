/**
 * Promote high-frequency project lessons (occurrence count >= 3) to the global,
 * stack-scoped cache (`fusengine-cache/lessons/_global/<stack>.json`, cap 25).
 * Ports the ai-pilot `promote-global-lessons.ts` (a spawned subprocess) as an
 * in-process call from `cacheSniperLessons`. Pure side-effect.
 */
import { homedir } from "node:os";
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readJsonFile, writeJsonFile } from "../../../util/json-io";
import { cacheBaseDir } from "./cache-base";
import { logCacheEvent } from "./analytics";
import type { LessonEntry } from "./types";

/** A promoted global lesson tagged with the project hashes that produced it. */
export interface GlobalLesson extends LessonEntry {
  source_projects: string[];
}

const MIN_COUNT = 3;
const MAX_GLOBAL = 25;

/** Group lessons by `error_type:pattern`. */
function groupByKey<T extends LessonEntry>(lessons: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const l of lessons) {
    const key = `${l.error_type}:${l.pattern}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(l);
  }
  return [...groups.values()];
}

/** Read every project lesson file's `errors` into one flat (un-deduped) list. */
async function aggregateErrors(cacheDir: string): Promise<LessonEntry[]> {
  let files: string[];
  try { files = readdirSync(cacheDir).filter((f) => f.endsWith(".json")); } catch { return []; }
  const all: LessonEntry[] = [];
  for (const f of files) {
    const data = await readJsonFile<{ errors?: LessonEntry[] }>(join(cacheDir, f));
    if (data?.errors) all.push(...data.errors);
  }
  return all;
}

/** Keep groups seen >= MIN_COUNT times, collapsed to a single lesson each. */
function filterFrequent(lessons: LessonEntry[]): LessonEntry[] {
  return groupByKey(lessons).filter((e) => e.length >= MIN_COUNT).map((entries) => {
    const first = entries[0] as LessonEntry;
    return {
      error_type: first.error_type, pattern: first.pattern, fix: first.fix, last_seen: first.last_seen,
      count: entries.length,
      files: [...new Set(entries.flatMap((e) => e.files))],
      code: { line: [...new Set(entries.flatMap((e) => e.code?.line ?? []))].slice(0, 5) },
    };
  });
}

/** Merge tagged candidates into existing global lessons; dedup, sum, sort, cap. */
function mergeGlobal(existing: GlobalLesson[], candidates: LessonEntry[], projHash: string): GlobalLesson[] {
  const tagged: GlobalLesson[] = candidates.map((c) => ({ ...c, source_projects: [projHash] }));
  return groupByKey([...existing, ...tagged]).map((entries) => {
    const first = entries[0] as GlobalLesson;
    return {
      error_type: first.error_type, pattern: first.pattern, fix: first.fix, last_seen: first.last_seen,
      count: entries.reduce((sum, e) => sum + e.count, 0),
      files: [...new Set(entries.flatMap((e) => e.files))],
      code: { line: [...new Set(entries.flatMap((e) => e.code?.line ?? []))].slice(0, 5) },
      source_projects: [...new Set(entries.flatMap((e) => e.source_projects ?? []))],
    };
  }).sort((a, b) => b.count - a.count).slice(0, MAX_GLOBAL);
}

/**
 * Promote high-frequency lessons from `cacheDir` to the global stack file.
 * @param cacheDir - Per-project lessons cache dir to scan.
 * @param stack - Detected project stack (`nextjs`, `laravel`, …, `universal`).
 * @param projHash - Source project hash (tags promoted entries).
 * @param home - Home dir (defaults to `~`).
 */
export async function promoteGlobalLessons(cacheDir: string, stack: string, projHash: string, home: string = homedir()): Promise<void> {
  const candidates = filterFrequent(await aggregateErrors(cacheDir));
  if (candidates.length === 0) return;

  const globalDir = join(cacheBaseDir(home), "lessons", "_global");
  mkdirSync(globalDir, { recursive: true });
  const globalFile = join(globalDir, `${stack}.json`);
  const existing = (await readJsonFile<GlobalLesson[]>(globalFile)) ?? [];
  const merged = mergeGlobal(existing, candidates, projHash);

  await writeJsonFile(globalFile, merged, true);
  logCacheEvent("lessons", "promoted", projHash, { count: merged.length, stack }, home);
}
