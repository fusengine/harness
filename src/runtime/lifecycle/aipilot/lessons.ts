/**
 * Lesson aggregation, dedup, merge, and edit categorization for the ai-pilot
 * scope. Ported from the ai-pilot plugin's `cache/lesson-aggregator.ts` +
 * `cache/lesson-helpers.ts` (now removed).
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { readJsonFile } from "../../../util/json-io";
import { cacheBaseDir } from "./cache-base";
import type { EditEntry, LessonEntry } from "./types";

/** Deduplicate lessons by `error_type:pattern`, summing counts. */
export function dedupLessons(lessons: LessonEntry[]): LessonEntry[] {
  const groups = new Map<string, LessonEntry[]>();
  for (const l of lessons) {
    const key = `${l.error_type}:${l.pattern}`;
    const group = groups.get(key);
    if (group) group.push(l); else groups.set(key, [l]);
  }
  return [...groups.values()].map((entries) => {
    const first = entries[0] as LessonEntry;
    return {
      error_type: first.error_type,
      pattern: first.pattern,
      fix: first.fix,
      last_seen: first.last_seen,
      count: entries.reduce((s, e) => s + e.count, 0),
      files: [...new Set(entries.flatMap((e) => e.files))],
      code: { line: [...new Set(entries.flatMap((e) => e.code?.line ?? []))].slice(0, 5) },
    };
  }).sort((a, b) => b.count - a.count);
}

/** Aggregate all local lesson JSON files into a flat deduplicated list. */
export async function aggregateLocalLessons(cacheDir: string): Promise<LessonEntry[]> {
  if (!existsSync(cacheDir)) return [];
  const files = readdirSync(cacheDir).filter((f) => f.endsWith(".json"));
  const all: LessonEntry[] = [];
  for (const f of files) {
    const data = await readJsonFile<{ errors?: LessonEntry[] }>(join(cacheDir, f));
    if (data?.errors) all.push(...data.errors);
  }
  return dedupLessons(all);
}

/** Load global lessons for a stack (stack-specific + universal). */
export async function loadGlobalLessons(stack: string, home: string = homedir()): Promise<LessonEntry[]> {
  const globalDir = join(cacheBaseDir(home), "lessons", "_global");
  const result: LessonEntry[] = [];
  for (const name of [`${stack}.json`, "universal.json"]) {
    const data = await readJsonFile<LessonEntry[]>(join(globalDir, name));
    if (data) result.push(...data);
  }
  return result;
}

/** Merge local + global lessons, dedup by type+pattern, sort by count desc. */
export function mergeLessons(local: LessonEntry[], global: LessonEntry[]): LessonEntry[] {
  return dedupLessons([...local, ...global]);
}

/** Categorize an edit entry by analyzing the new code content. */
export function categorizeEdit(edit: EditEntry): string {
  const n = edit.newStr.toLowerCase();
  if (n.includes("use client")) return "missing_directive";
  if (n.includes("displayname")) return "missing_display_name";
  if (/onkeydown|tabindex|role=/.test(n)) return "missing_a11y";
  if (/try|catch/.test(n)) return "missing_error_handling";
  if (/\?\?|if.*null/.test(n)) return "null_safety";
  return "code_fix";
}
