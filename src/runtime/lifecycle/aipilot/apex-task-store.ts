/**
 * APEX `task.json` mutation helpers + a directory-based lock for the ai-pilot
 * scope. Ported from the ai-pilot plugin's `apex/state.ts` + `apex/task-helpers.ts`
 * (now removed).
 */
import { mkdir, rmdir } from "node:fs/promises";
import { readJsonFile, writeJsonFile } from "../../../util/json-io";
import { sleep } from "../../../util/runtime-io";
import type { ApexTaskFile } from "./types";

/**
 * Acquire a directory-based lock with a timeout.
 * @param lockDir - Path to the lock directory.
 * @param timeoutMs - Max wait in ms (default 5000).
 * @returns A release function, or null if acquisition timed out.
 */
export async function acquireLock(lockDir: string, timeoutMs = 5000): Promise<(() => Promise<void>) | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await mkdir(lockDir, { recursive: false });
      return async () => { try { await rmdir(lockDir); } catch { /* noop */ } };
    } catch { await sleep(100); }
  }
  return null;
}

/** Add a new task to `task.json`. */
export async function taskCreate(file: string, id: string, subject: string, desc: string): Promise<void> {
  const data = await readJsonFile<ApexTaskFile>(file);
  if (!data) return;
  data.tasks[id] = {
    subject, description: desc, status: "pending", phase: "pending",
    created_at: new Date().toISOString(), doc_consulted: {}, files_modified: [], blockedBy: [],
  };
  await writeJsonFile(file, data);
}

/** Mark a task as in_progress in `task.json`. */
export async function taskStart(file: string, id: string, subject?: string, desc?: string, blocked?: string): Promise<void> {
  const data = await readJsonFile<ApexTaskFile>(file);
  if (!data) return;
  if (!data.tasks[id]) {
    data.tasks[id] = { subject: "", description: "", status: "in_progress", phase: "analyze", doc_consulted: {}, files_modified: [] };
  }
  data.current_task = id;
  const task = data.tasks[id];
  Object.assign(task, { status: "in_progress", phase: "analyze", started_at: new Date().toISOString() });
  if (subject) task.subject = subject;
  if (desc) task.description = desc;
  if (blocked) task.blockedBy = blocked.split(",");
  await writeJsonFile(file, data);
}

/** Mark a task as completed in `task.json`. */
export async function taskComplete(file: string, id: string): Promise<void> {
  const data = await readJsonFile<ApexTaskFile>(file);
  if (!data?.tasks[id]) return;
  Object.assign(data.tasks[id], { status: "completed", phase: "completed", completed_at: new Date().toISOString() });
  await writeJsonFile(file, data);
}
