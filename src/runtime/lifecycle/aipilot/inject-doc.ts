/**
 * SubagentStart (matcher "research-expert") for the ai-pilot scope: inject
 * cached documentation summaries. Ports `doc-cache-inject.ts`. Doc *saving*
 * happens on SubagentStop (`cache-doc.ts`).
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readJsonFile } from "../../../util/json-io";
import { readText, pathExists } from "../../../util/runtime-io";
import { contextResponse } from "../../../adapters/claude";
import { cacheDirFor, cacheAge, projectHash } from "./cache-base";
import { logCacheEvent } from "./analytics";
import type { CacheEntry, CacheIndex } from "./types";

const TTL_SECONDS = 604_800;
const MAX_SIZE = 8192;

/** Concatenate fresh, dedup-by-hash cached doc bodies. */
async function buildDocsContext(entries: CacheEntry[], docsDir: string, now: number): Promise<{ ctx: string; count: number; maxAge: number }> {
  let ctx = "";
  let count = 0;
  let maxAge = 0;
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.timestamp) continue;
    const age = cacheAge(entry.timestamp, now);
    if (age >= TTL_SECONDS) continue;
    if (age > maxAge) maxAge = age;
    if (!entry.hash || seen.has(entry.hash)) continue;
    seen.add(entry.hash);
    const docPath = join(docsDir, `${entry.hash}.md`);
    if (!pathExists(docPath)) continue;
    const content = readText(docPath);
    if (!content) continue;
    ctx += `\n${content}\n`;
    count++;
  }
  return { ctx, count, maxAge };
}

/**
 * SubagentStart for research-expert: inject cached doc summaries, or "".
 * @param cwd - Fallback project root (uses `CLAUDE_PROJECT_DIR` first).
 * @param home - Home dir (defaults to `~`).
 * @param now - Clock (defaults to `Date.now()`).
 * @returns The native hook stdout (possibly empty).
 */
export async function injectDocCache(cwd: string, home: string = homedir(), now: number = Date.now()): Promise<string> {
  const projPath = process.env.CLAUDE_PROJECT_DIR ?? cwd;
  const pHash = projectHash(projPath);
  const cacheDir = cacheDirFor("doc", projPath, home);
  const index = await readJsonFile<CacheIndex>(join(cacheDir, "index.json"));
  if (!index?.docs?.length) return "";

  const { ctx, count, maxAge } = await buildDocsContext(index.docs, join(cacheDir, "docs"), now);
  if (count === 0) return "";
  logCacheEvent("doc", "hit", pHash, { docs_injected: count }, home);

  const ageH = Math.ceil(maxAge / 3600);
  const header = `## CACHED DOCUMENTATION (${count} docs, ${ageH}h ago)\nUse this knowledge. Only query Context7 for topics NOT covered below.\n`;
  const full = `${header}${ctx}Full docs: ${join(cacheDir, "docs")}/`.slice(0, MAX_SIZE);
  return contextResponse("SubagentStart", full);
}
