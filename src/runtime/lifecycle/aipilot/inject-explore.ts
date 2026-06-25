/**
 * SubagentStart (matcher "explore-codebase") for the ai-pilot scope: serve a
 * cached architecture report when fresh + config-matching, else inject save
 * instructions. Ports `explore-cache-check.ts`.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readJsonFile } from "../../../util/json-io";
import { contextResponse } from "../../../adapters/claude";
import { hashText16, cacheDirFor, cacheAge, projectHash } from "./cache-base";
import { logCacheEvent } from "./analytics";

const TTL_SECONDS = 86_400;
const CONFIG_FILES = ["package.json", "tsconfig.json", "composer.json", "go.mod", "Cargo.toml", "Package.swift", "biome.json", ".eslintrc.js", ".eslintrc.json"];

/** Compute a config hash from git-tracked config files; "noconfig" on failure. */
async function configHash(cwd: string): Promise<string> {
  try {
    const proc = Bun.spawn(["git", "ls-tree", "HEAD", ...CONFIG_FILES], { cwd, stdout: "pipe", stderr: "ignore" });
    const output = await new Response(proc.stdout).text();
    return output.trim() ? hashText16(output) : "noconfig";
  } catch {
    return "noconfig";
  }
}

/** Build the cache-miss save-instructions block. */
function missBlock(cacheDir: string, metaFile: string, snapFile: string, ts: string, cfgHash: string, projPath: string): string {
  return `## EXPLORATION CACHE INSTRUCTIONS\nAfter completing your exploration, save the report for future runs:\n\`\`\`bash\nmkdir -p ${cacheDir}\ncat > ${metaFile} << 'METAEOF'\n{"timestamp":"${ts}","config_hash":"${cfgHash}","project":"${projPath}"}\nMETAEOF\n\`\`\`\nThen write your full exploration report (markdown) to: ${snapFile}`;
}

/**
 * SubagentStart for explore-codebase: inject cached architecture or save block.
 * @param cwd - Fallback project root (uses `CLAUDE_PROJECT_DIR` first).
 * @param home - Home dir (defaults to `~`).
 * @param now - Clock (defaults to `Date.now()`).
 * @returns The native hook stdout.
 */
export async function injectExploreCache(cwd: string, home: string = homedir(), now: number = Date.now()): Promise<string> {
  const projPath = process.env.CLAUDE_PROJECT_DIR ?? cwd;
  const pHash = projectHash(projPath);
  const cacheDir = cacheDirFor("explore", projPath, home);
  const metaFile = join(cacheDir, "metadata.json");
  const snapFile = join(cacheDir, "snapshot.md");
  const cfgHash = await configHash(projPath);

  let context = "";
  const meta = await readJsonFile<{ timestamp: string; config_hash: string }>(metaFile);
  const snapBunFile = Bun.file(snapFile);
  const snapshot = (await snapBunFile.exists()) ? await snapBunFile.text() : "";

  if (meta?.timestamp && snapshot) {
    const age = cacheAge(meta.timestamp, now);
    if (age < TTL_SECONDS && meta.config_hash === cfgHash) {
      context = `## CACHED ARCHITECTURE AVAILABLE (age: ${Math.floor(age / 60)}min)\nUSE this cached report. Do NOT run full exploration. Return it immediately.\n\n${snapshot}`;
      logCacheEvent("explore", "hit", pHash, {}, home);
    }
  }
  if (!context) {
    logCacheEvent("explore", "miss", pHash, {}, home);
    const ts = new Date(now).toISOString().replace(/\.\d+Z$/, "");
    context = missBlock(cacheDir, metaFile, snapFile, ts, cfgHash, projPath);
  }
  return contextResponse("SubagentStart", context);
}
