/**
 * SubagentStart (matcher "sniper") for the ai-pilot scope: tell sniper which
 * source files changed vs. already-validated. Ports `test-cache-inject.ts`.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readJsonFile } from "../../../util/json-io";
import { contextResponse } from "../../../adapters/claude";
import { cacheDirFor, cacheAge, fileChecksum } from "./cache-base";
import { scanSourceFiles } from "./source-scan";
import type { TestCache } from "./types";

const TTL_SECONDS = 172_800;

/**
 * SubagentStart for sniper: inject the changed-file list, or "" when nothing
 * useful to say (no cache / no unchanged files).
 * @param cwd - Fallback project root (uses `CLAUDE_PROJECT_DIR` first).
 * @param home - Home dir (defaults to `~`).
 * @param now - Clock (defaults to `Date.now()`).
 * @returns The native hook stdout (possibly empty).
 */
export async function injectTestCache(cwd: string, home: string = homedir(), now: number = Date.now()): Promise<string> {
  const projectPath = process.env.CLAUDE_PROJECT_DIR ?? cwd;
  const resultsPath = join(cacheDirFor("tests", projectPath, home), "results.json");
  const cache = await readJsonFile<TestCache>(resultsPath);
  if (!cache?.files || Object.keys(cache.files).length === 0) return "";

  const srcFiles = await scanSourceFiles(projectPath);
  if (srcFiles.length === 0) return "";

  const changed: string[] = [];
  let unchanged = 0;
  for (const filepath of srcFiles) {
    const relPath = filepath.replace(`${projectPath}/`, "");
    const cached = cache.files[relPath];
    if (!cached) { changed.push(relPath); continue; }
    const currentSum = (await fileChecksum(filepath)).slice(0, 16);
    if (currentSum !== cached.checksum) { changed.push(relPath); continue; }
    if (cached.last_tested && cacheAge(cached.last_tested, now) > TTL_SECONDS) { changed.push(relPath); continue; }
    unchanged++;
  }
  if (unchanged === 0) return "";

  const changedList = changed.map((f) => `- ${f}`).join("\n");
  const ctx = `## TEST CACHE (${unchanged}/${srcFiles.length} files already validated)\nOnly run linters on these CHANGED files:\n${changedList}\nSKIP linting on ${unchanged} unchanged files - already PASS.`;
  return contextResponse("SubagentStart", ctx);
}
