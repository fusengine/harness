/**
 * Cache analytics for the ai-pilot scope: append hit/miss events to
 * `sessions.jsonl` and aggregate them into `summary.json` on SessionEnd.
 * Ports `cache-analytics-save.ts` + the `logCacheEvent` helper.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { readJsonFile, writeJsonFile } from "../../../util/json-io";
import { cacheBaseDir } from "./cache-base";

const TOKEN_WEIGHTS: Record<string, number> = { explore: 15000, doc: 10000, lessons: 3000, tests: 5000 };
const CATEGORIES = ["explore", "doc", "lessons", "tests"] as const;

/** A raw analytics event line in `sessions.jsonl`. */
export interface SessionEntry { ts: string; type: string; action: string; session?: string }

/** Aggregated cache analytics persisted to `summary.json`. */
export interface Summary {
  updated: string;
  total_sessions: number;
  cache_hits: Record<string, number>;
  cache_misses: Record<string, number>;
  hit_rates: Record<string, string>;
  estimated_tokens_saved: number;
}

/** Append a single cache event to `analytics/sessions.jsonl` (best effort). */
export function logCacheEvent(type: string, action: string, projHash: string, extra: Record<string, unknown> = {}, home: string = homedir()): void {
  try {
    const dir = join(cacheBaseDir(home), "analytics");
    mkdirSync(dir, { recursive: true });
    const entry = { ts: new Date().toISOString(), session: String(Math.floor(Date.now() / 1000)), type, action, project_hash: projHash, ...extra };
    appendFileSync(join(dir, "sessions.jsonl"), JSON.stringify(entry) + "\n");
  } catch { /* best effort */ }
}

/** Count entries matching a `type`+`action`. */
function countBy(entries: SessionEntry[], type: string, action: string): number {
  return entries.filter((e) => e.type === type && e.action === action).length;
}

/** Format a hit-rate percentage string. */
function hitRate(hits: number, misses: number): string {
  const total = hits + misses;
  return total === 0 ? "0%" : `${Math.floor((hits * 100) / total)}%`;
}

/** Parse the JSONL session log into typed entries. */
function parseEntries(raw: string): SessionEntry[] {
  return raw.split("\n").filter(Boolean)
    .map((line) => { try { return JSON.parse(line) as SessionEntry; } catch { return null; } })
    .filter((e): e is SessionEntry => e !== null);
}

/**
 * Aggregate `sessions.jsonl` into `summary.json` and prune entries > 30 days.
 * Ports `cache-analytics-save.ts`. SessionEnd hook output is ignored by Claude,
 * so this returns nothing — it is a pure side-effect.
 * @param home - Home dir (defaults to `~`).
 * @param now - Clock (defaults to `Date.now()`).
 */
export async function cacheAnalyticsSave(home: string = homedir(), now: number = Date.now()): Promise<void> {
  const dir = join(cacheBaseDir(home), "analytics");
  const sessionsFile = join(dir, "sessions.jsonl");
  const file = Bun.file(sessionsFile);
  if (!(await file.exists())) return;
  const raw = await file.text();
  if (!raw.trim()) return;
  const entries = parseEntries(raw);
  if (entries.length === 0) return;

  const hits: Record<string, number> = {};
  const misses: Record<string, number> = {};
  for (const cat of CATEGORIES) {
    hits[cat] = countBy(entries, cat, "hit") + (cat === "doc" ? countBy(entries, cat, "blocked") : 0);
    misses[cat] = countBy(entries, cat, "miss");
  }
  const tokensSaved = CATEGORIES.reduce((sum, c) => sum + (hits[c] ?? 0) * (TOKEN_WEIGHTS[c] ?? 0), 0);
  const sessionCount = new Set(entries.map((e) => e.session).filter(Boolean)).size;

  const old = await readJsonFile<Summary>(join(dir, "summary.json"));
  const merged: Summary = {
    updated: new Date(now).toISOString(),
    total_sessions: (old?.total_sessions ?? 0) + sessionCount,
    cache_hits: {}, cache_misses: {}, hit_rates: {},
    estimated_tokens_saved: (old?.estimated_tokens_saved ?? 0) + tokensSaved,
  };
  for (const cat of CATEGORIES) {
    merged.cache_hits[cat] = (old?.cache_hits?.[cat] ?? 0) + (hits[cat] ?? 0);
    merged.cache_misses[cat] = (old?.cache_misses?.[cat] ?? 0) + (misses[cat] ?? 0);
    merged.hit_rates[cat] = hitRate(merged.cache_hits[cat] ?? 0, merged.cache_misses[cat] ?? 0);
  }
  await writeJsonFile(join(dir, "summary.json"), merged, true);

  const cutoff = new Date(now - 30 * 86_400_000).toISOString();
  const kept = entries.filter((e) => e.ts >= cutoff);
  await Bun.write(sessionsFile, kept.map((e) => JSON.stringify(e)).join("\n") + "\n");
}
