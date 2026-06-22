import { readJsonFile, writeJsonFile } from "../util/json-io";

/** A task entry in task.json. */
export interface ApexTask {
  subject: string;
  description: string;
  status: string;
  phase: string;
  started_at?: string;
  completed_at?: string;
  created_at?: string;
  doc_consulted: Record<string, unknown>;
  files_modified: string[];
  blockedBy?: string[];
}

/** Structure of `.claude/apex/task.json`. */
export interface ApexTaskFile {
  current_task: string;
  created_at: string;
  tasks: Record<string, ApexTask>;
}

/** Add a new pending task. */
export async function taskCreate(file: string, id: string, subject: string, desc: string): Promise<void> {
  const data = await readJsonFile<ApexTaskFile>(file);
  if (!data) return;
  data.tasks[id] = {
    subject, description: desc, status: "pending", phase: "pending",
    created_at: new Date().toISOString(), doc_consulted: {}, files_modified: [], blockedBy: [],
  };
  await writeJsonFile(file, data);
}

/** Mark a task in_progress (creating a stub if absent). */
export async function taskStart(
  file: string, id: string, subject?: string, desc?: string, blocked?: string,
): Promise<void> {
  const data = await readJsonFile<ApexTaskFile>(file);
  if (!data) return;
  const task: ApexTask = data.tasks[id] ?? {
    subject: "", description: "", status: "in_progress", phase: "analyze",
    doc_consulted: {}, files_modified: [],
  };
  data.tasks[id] = task;
  data.current_task = id;
  task.status = "in_progress";
  task.phase = "analyze";
  task.started_at = new Date().toISOString();
  if (subject) task.subject = subject;
  if (desc) task.description = desc;
  if (blocked) task.blockedBy = blocked.split(",");
  await writeJsonFile(file, data);
}

/** Mark a task completed. */
export async function taskComplete(file: string, id: string): Promise<void> {
  const data = await readJsonFile<ApexTaskFile>(file);
  const task = data?.tasks[id];
  if (!data || !task) return;
  task.status = "completed";
  task.phase = "completed";
  task.completed_at = new Date().toISOString();
  await writeJsonFile(file, data);
}
