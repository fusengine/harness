/**
 * SubagentStop (matcher "sniper") for the ai-pilot scope: extract linter
 * results from the transcript and cache per-file checksums. Ports
 * `cache-test-results.ts`. Pure side-effect.
 */
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { readJsonFile, writeJsonFile } from "../../../util/json-io";
import { cacheDirFor, projectHash, fileChecksum } from "./cache-base";
import { logCacheEvent } from "./analytics";
import { transcriptFilePaths, projectRootFromPaths } from "./transcript";
import { scanSourceFiles } from "./source-scan";
import type { TestCache, TestResult } from "./types";

/** Extract linter-related command/output text from a JSONL transcript. */
async function extractLinterOutput(path: string): Promise<string> {
  const text = await Bun.file(path).text();
  const outputs: string[] = [];
  for (const line of text.split("\n").filter(Boolean)) {
    try {
      const content = (JSON.parse(line) as { message?: { content?: unknown } })?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block.type === "tool_use" && block.name === "Bash") {
          const cmd = block.input?.command ?? "";
          if (/eslint|tsc|biome|npx.*lint/i.test(cmd)) outputs.push(cmd);
        }
        if (block.type === "tool_result" || block.type === "text") outputs.push(block.text ?? block.content ?? "");
      }
    } catch { /* skip malformed */ }
  }
  return outputs.join("\n");
}

/**
 * SubagentStop sniper: cache linter results per-file with checksums.
 * @param transcript - Path to the agent JSONL transcript.
 * @param cwd - Fallback project root.
 * @param home - Home dir (defaults to `~`).
 */
export async function cacheTestResults(transcript: string | undefined, cwd: string, home: string = homedir()): Promise<void> {
  if (!transcript || !(await Bun.file(transcript).exists())) return;
  const allPaths = await transcriptFilePaths(transcript);
  const projectPath = projectRootFromPaths(allPaths) ?? process.env.CLAUDE_PROJECT_DIR ?? cwd;
  const pHash = projectHash(projectPath);
  const cacheDir = cacheDirFor("tests", projectPath, home);
  mkdirSync(cacheDir, { recursive: true });
  const resultsPath = join(cacheDir, "results.json");

  const linterOutput = await extractLinterOutput(transcript);
  if (!linterOutput) return;
  const srcFiles = await scanSourceFiles(projectPath);
  if (srcFiles.length === 0) return;

  const existing = (await readJsonFile<TestCache>(resultsPath)) ?? { timestamp: "", files: {} };
  const timestamp = new Date().toISOString();
  const newFiles: Record<string, TestResult> = {};
  for (const filepath of srcFiles) {
    const relPath = filepath.replace(`${projectPath}/`, "");
    const checksum = (await fileChecksum(filepath)).slice(0, 16);
    if (!checksum) continue;
    const basename = filepath.split("/").pop() ?? "";
    const hasError = linterOutput.includes(basename) && linterOutput.includes("error");
    newFiles[relPath] = { checksum, eslint: hasError ? "fail" : "pass", tsc: "pass", last_tested: timestamp };
  }
  await writeJsonFile(resultsPath, { timestamp, files: { ...existing.files, ...newFiles } }, true);
  logCacheEvent("tests", "hit", pHash, { count: Object.keys(newFiles).length }, home);
}
