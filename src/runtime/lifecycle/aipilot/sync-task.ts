/**
 * PostToolUse (matcher "TaskCreate|TaskUpdate") for the ai-pilot scope:
 * synchronize Claude task tools with `.claude/apex/task.json` and prompt an
 * auto-commit on completion when git changes are detected. Ports
 * `sync-task-tracking.ts`.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readJsonFile } from "../../../util/json-io";
import { contextResponse } from "../../../adapters/claude";
import { acquireLock, taskCreate, taskStart, taskComplete } from "./apex-task-store";
import type { ApexTaskFile } from "./types";

/** True when the project has uncommitted git changes. */
async function hasGitChanges(cwd: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["git", "status", "--porcelain"], { cwd, stdout: "pipe", stderr: "ignore" });
    return (await new Response(proc.stdout).text()).trim().length > 0;
  } catch { return false; }
}

/** Handle a completed task: emit the commit reminder (or the no-change note). */
async function onComplete(taskFile: string, taskId: string, projectRoot: string): Promise<string> {
  await taskComplete(taskFile, taskId);
  if (!(await hasGitChanges(projectRoot))) {
    return contextResponse("PostToolUse", "Task completed. No changes to commit.");
  }
  const data = await readJsonFile<ApexTaskFile>(taskFile);
  const subject = data?.tasks[taskId]?.subject ?? "Task";
  return contextResponse("PostToolUse", `Task #${taskId} completed: ${subject}\n\nChanges detected. MANDATORY: Run /fuse-commit-pro:commit to commit with smart detection.`);
}

/**
 * PostToolUse TaskCreate/TaskUpdate handler.
 * @param payload - The raw hook payload (`tool_name`, `tool_input`, `tool_response`).
 * @param cwd - Fallback project root (uses `CLAUDE_PROJECT_DIR` first).
 * @returns The native hook stdout (possibly empty).
 */
export async function syncTaskTracking(payload: Record<string, unknown>, cwd: string): Promise<string> {
  const toolName = String(payload.tool_name ?? "");
  if (toolName !== "TaskCreate" && toolName !== "TaskUpdate") return "";

  const projectRoot = process.env.CLAUDE_PROJECT_DIR ?? cwd;
  const taskFile = join(projectRoot, ".claude", "apex", "task.json");
  if (!existsSync(taskFile)) return "";

  const unlock = await acquireLock(join(projectRoot, ".claude", "apex", ".task.lock"), 10000);
  if (!unlock) return "";
  try {
    const ti = (payload.tool_input ?? {}) as Record<string, string>;
    if (toolName === "TaskCreate") {
      const existing = (await readJsonFile<ApexTaskFile>(taskFile))?.tasks ?? {};
      const respId = (payload.tool_response as { id?: string } | undefined)?.id;
      const taskId = respId ?? String(Math.max(0, ...Object.keys(existing).map(Number)) + 1);
      await taskCreate(taskFile, taskId, ti.subject ?? "", ti.description ?? "");
      return "";
    }
    const taskId = ti.taskId ?? "";
    if (!taskId) return "";
    const newStatus = ti.status ?? "";
    if (newStatus === "in_progress") {
      const blocked = (ti.addBlockedBy as unknown as string[] | undefined)?.join(",") ?? "";
      await taskStart(taskFile, taskId, ti.subject || undefined, ti.description || undefined, blocked || undefined);
    }
    if (newStatus === "completed") return onComplete(taskFile, taskId, projectRoot);
    return "";
  } finally {
    await unlock();
  }
}
