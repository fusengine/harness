import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveMaxLines } from "../config/limits";

/** Parsed task state injected into a Task sub-agent prompt. */
export interface ApexTaskState {
  /** Current task id (defaults to "1"). */
  id: string;
  /** Task subject (defaults to ""). */
  subject: string;
  /** Current phase (defaults to "analyze"). */
  phase: string;
  /** Comma-joined consulted doc keys, or "none". */
  docs: string;
}

/**
 * Read the current task state from `task.json`, reproducing the legacy Python
 * logic. Any read/parse error falls back to `("1", "", "analyze", "none")`.
 * @param taskFile - Absolute path to `.claude/apex/task.json`.
 * @returns The parsed {@link ApexTaskState}.
 */
export function loadApexTaskState(taskFile: string): ApexTaskState {
  try {
    const data = JSON.parse(readFileSync(taskFile, "utf-8")) as Record<string, unknown>;
    const id = String(data.current_task ?? "1");
    const tasks = (data.tasks as Record<string, unknown> | undefined) ?? {};
    const task = (tasks[id] as Record<string, unknown> | undefined) ?? {};
    const subject = typeof task.subject === "string" ? task.subject : "";
    const phase = typeof task.phase === "string" ? task.phase : "analyze";
    const consultedMap = (task.doc_consulted as Record<string, unknown> | undefined) ?? {};
    const consulted = Object.entries(consultedMap)
      .filter(([, v]) => typeof v === "object" && v !== null && (v as Record<string, unknown>).consulted === true)
      .map(([k]) => k);
    return { id, subject, phase, docs: consulted.join(", ") || "none" };
  } catch {
    return { id: "1", subject: "", phase: "analyze", docs: "none" };
  }
}

/**
 * Build the APEX context string injected into a Task sub-agent prompt.
 * @param state - The parsed task state.
 * @param maxLines - SOLID per-file line ceiling.
 * @returns The injection text.
 */
export function buildApexTaskContext(state: ApexTaskState, maxLines: number): string {
  return (
    `⚠️ APEX MODE - Read .claude/apex/AGENTS.md for rules\n\n` +
    `Current: Task #${state.id} - ${state.subject} (Phase: ${state.phase})\n` +
    `Docs consulted: ${state.docs}\n\n` +
    `Agent must:\n` +
    `1. Read task.json → find last 3 completed tasks\n` +
    `2. Read their notes in docs/ (task-{ID}-{subject}.md)\n` +
    `3. TaskList → see pending tasks\n` +
    `4. TaskUpdate(in_progress) → before starting\n` +
    `5. Apply SOLID (files < ${maxLines} lines)\n` +
    `6. Write notes to docs/task-{ID}-{subject}.md\n` +
    `7. TaskUpdate(completed) → triggers auto-commit`
  );
}

/**
 * Build the PreToolUse Task injection, gated on the existence of the project's
 * `.claude/apex/` directory. Returns `null` when APEX is not active (no dir).
 * @param projectRoot - `CLAUDE_PROJECT_DIR` or cwd.
 * @returns The injection text, or `null` to emit nothing.
 */
export function buildApexTaskInjection(projectRoot: string): string | null {
  const apexDir = join(projectRoot, ".claude", "apex");
  if (!existsSync(apexDir)) return null;
  const state = loadApexTaskState(join(apexDir, "task.json"));
  return buildApexTaskContext(state, resolveMaxLines());
}
