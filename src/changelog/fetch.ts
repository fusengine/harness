/**
 * Changelog scanner — ports the changelog-watcher plugin's `fetch-changelog`
 * into the harness (exposed as the `harness changelog` CLI verb). Fetches the
 * official Claude Code changelog, detects how many versions are new since the
 * last check, persists per-day state, and returns a JSON summary. Dual-runtime:
 * global `fetch` + `node:fs` (works under Node 20+ and Bun, no imports needed).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { claudeHome } from "../runtime/home-state";
import { todayUtc } from "../runtime/lifecycle/security/skill-state";

const CHANGELOG_URL = "https://code.claude.com/docs/en/changelog.md";

/** Summary printed by the CLI (and consumed by the changelog-scan skill). */
export interface ChangelogScan {
  latest: string;
  new_since_last_check: number;
  recent_versions: string[];
}

/** Persisted per-day state under `~/.claude/logs/00-changelog/`. */
interface ChangelogState { last_version: string; previous: string; new_versions: number; checked: string }

/**
 * Parse up to 10 semver versions from the changelog, newest first. Matches the
 * current docs format (`<Update label="X.Y.Z" …>` MDX blocks) AND the legacy
 * markdown headers (`## vX.Y.Z` / `## X.Y.Z`) so it survives a format rollback.
 */
export function parseVersions(md: string): string[] {
  const re = /<Update\s+label="v?(\d+\.\d+\.\d+)"|^##\s+v?(\d+\.\d+\.\d+)/gm;
  return [...md.matchAll(re)].map((m) => m[1] ?? m[2] ?? "").filter(Boolean).slice(0, 10);
}

/** Count versions newer than `lastKnown` (stops at the first match). */
export function countNew(versions: string[], lastKnown: string): number {
  if (!lastKnown) return 0;
  let n = 0;
  for (const v of versions) { if (v === lastKnown) break; n++; }
  return n;
}

/** Read the saved `last_version` for today's state file ("" when absent/corrupt). */
function lastKnownVersion(stateFile: string): string {
  if (!existsSync(stateFile)) return "";
  try {
    return (JSON.parse(readFileSync(stateFile, "utf8")) as ChangelogState).last_version ?? "";
  } catch {
    return "";
  }
}

/**
 * Fetch + parse the changelog, diff against the saved state, persist, and return
 * the scan summary. Throws on network failure (the CLI maps it to exit 1).
 * @param now - Clock (ms).
 * @param home - Home dir.
 */
export async function scanChangelog(now: number = Date.now(), home: string = homedir()): Promise<ChangelogScan> {
  const res = await fetch(CHANGELOG_URL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`changelog fetch failed: ${res.status}`);
  const versions = parseVersions(await res.text());
  const latest = versions[0] ?? "";

  const dir = join(claudeHome(home), "logs", "00-changelog");
  const today = todayUtc(now);
  const stateFile = join(dir, `${today}-state.json`);
  const lastKnown = lastKnownVersion(stateFile);
  const newCount = countNew(versions, lastKnown);

  try {
    mkdirSync(dir, { recursive: true });
    const state: ChangelogState = { last_version: latest, previous: lastKnown, new_versions: newCount, checked: today };
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch { /* best effort — the summary is still returned */ }

  return { latest, new_since_last_check: newCount, recent_versions: versions };
}
