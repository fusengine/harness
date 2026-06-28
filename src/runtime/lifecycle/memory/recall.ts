/**
 * SessionStart memory handler. Ports `recall-on-session.py`: detect the project
 * type, recall relevant lessons from Graphiti, log the recall, and inject a
 * neural-memory-recall additionalContext block.
 */
import { basename } from "node:path";
import { contextResponse } from "../../../adapters/claude";
import { isoUtc } from "../security/skill-state";
import { searchMemory } from "./client";
import { appendMemoryLog, detectProjectType } from "./state";

/**
 * Handle SessionStart: recall past lessons for this project and return the
 * native additionalContext stdout (or "" when there is nothing to recall).
 * @param cwd - Project root.
 * @param now - Clock.
 * @returns The native stdout (possibly empty).
 */
export async function recallOnSession(cwd: string, now: number): Promise<string> {
  const projectType = detectProjectType(cwd);
  const projectName = basename(cwd);
  const hits = await searchMemory(`${projectType} ${projectName} common errors`, 5);
  appendMemoryLog("recalls.log", `[${isoUtc(now)}] session_recall | ${projectType} | ${projectName}`);
  if (hits.length === 0) return "";
  const lessons = hits.slice(0, 5).map((r) => `- ${r.content || r.name || "unknown"}`).join("\n");
  const ctx =
    `Relevant lessons from past sessions:\n${lessons}\n` +
    `For deeper search: use mcp__qdrant__qdrant-find with project-specific queries.`;
  return contextResponse("SessionStart", ctx);
}
