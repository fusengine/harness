/**
 * SubagentStop (matcher "sniper") for the ai-pilot scope: capture error
 * patterns + corrected code from the sniper transcript as lessons. Ports
 * `cache-sniper-lessons.ts` (the dead `promote-global-lessons.ts` spawn is
 * dropped — that helper no longer exists). Pure side-effect.
 */
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeJsonFile } from "../../../util/json-io";
import { pathExists } from "../../../util/runtime-io";
import { cacheDirFor, projectHash } from "./cache-base";
import { logCacheEvent } from "./analytics";
import { transcriptEdits, transcriptReport, projectRootFromPaths } from "./transcript";
import { categorizeEdit } from "./lessons";
import type { LessonEntry } from "./types";

/**
 * SubagentStop sniper: extract lessons from the transcript and persist them.
 * @param transcript - Path to the agent JSONL transcript.
 * @param cwd - Fallback project root.
 * @param home - Home dir (defaults to `~`).
 */
export async function cacheSniperLessons(transcript: string | undefined, cwd: string, home: string = homedir()): Promise<void> {
  if (!transcript || !pathExists(transcript)) return;
  const edits = await transcriptEdits(transcript);
  if (edits.length === 0) return;

  const editPaths = edits.map((e) => e.file);
  const projectPath = projectRootFromPaths(editPaths) ?? process.env.CLAUDE_PROJECT_DIR ?? cwd;
  const pHash = projectHash(projectPath);
  const cacheDir = cacheDirFor("lessons", projectPath, home);
  mkdirSync(cacheDir, { recursive: true });

  const report = await transcriptReport(transcript);
  const timestamp = new Date().toISOString();
  const errors: LessonEntry[] = edits.map((edit) => {
    const basename = edit.file.split("/").pop() ?? edit.file;
    const descLine = report.split("\n").find((l) => l.toLowerCase().includes(basename.toLowerCase()));
    const errorType = categorizeEdit(edit);
    return {
      error_type: errorType,
      pattern: descLine ?? `Code correction in ${basename}`,
      fix: `Fix ${errorType} in ${basename}`,
      count: 1,
      last_seen: timestamp,
      files: [edit.file],
      code: { line: (edit.newStr ?? "").split("\n").filter(Boolean).slice(0, 10) },
    };
  });

  const safeName = timestamp.replace(/:/g, "-");
  await writeJsonFile(join(cacheDir, `${safeName}.json`), { project: projectPath, timestamp, errors }, true);
  logCacheEvent("lessons", "hit", pHash, { count: edits.length }, home);
}
