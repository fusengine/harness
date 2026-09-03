/** Collapses fully-validated task-PRD agent entries to their compact shape. Pure — no fs. */
import { isCompacted, subTasksOf } from "./prd-schema";
import type { PrdTaskAgentEntry, PrdTaskFile } from "./interfaces/types";

/** Collapses one agent entry to the compacted shape ONLY when every sub-task is `validated`; else returns it unchanged. */
export function compactAgentEntry(e: PrdTaskAgentEntry, at: string): PrdTaskAgentEntry {
  if (isCompacted(e)) return e;
  const subTasks = Object.values(subTasksOf(e));
  if (subTasks.length === 0 || !subTasks.every((s) => s.status === "validated")) return e;
  return { status: "validated", files: e.files, "validated-at": at };
}

/** Compacts every eligible agent entry in a task-PRD; reports which agent names got collapsed. */
export function compactTaskFile(taskFile: PrdTaskFile, at: string): { file: PrdTaskFile; compacted: string[] } {
  const compacted: string[] = [];
  const file: PrdTaskFile = {};
  for (const [agent, entry] of Object.entries(taskFile)) {
    const next = compactAgentEntry(entry, at);
    if (next !== entry) compacted.push(agent);
    file[agent] = next;
  }
  return { file, compacted };
}

/** True when every agent in the task-PRD is already compacted+validated. */
export function canPromoteRouterEntry(taskFile: PrdTaskFile): boolean {
  return Object.values(taskFile).every((entry) => isCompacted(entry));
}
