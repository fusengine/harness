import { basename, extname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { contextResponse } from "../../adapters/claude";
import { resolveMaxLines } from "../../config/limits";
import { countLines } from "../../policy/file-size";
import { loadSessionState, sanitizeSessionId } from "../home-state";

/** Code-file extensions audited on task completion (mirrors validate-task-solid.py). */
const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".php",
  ".cpp", ".c", ".rb", ".swift", ".kt", ".dart", ".vue", ".svelte", ".astro",
]);

/** Files modified during the session, persisted by {@link trackSessionChanges}. */
interface Changes {
  modifiedFiles?: string[];
}

/**
 * Re-count physical lines of every modified code file and collect SOLID
 * violations (`<basename>: <n> lines (max <max>)`) for those exceeding `max`.
 * @param files - Candidate modified file paths.
 * @param max - The SOLID line ceiling.
 * @returns The list of violation strings (empty when all files comply).
 */
function collectViolations(files: string[], max: number): string[] {
  const violations: string[] = [];
  for (const fp of files) {
    if (!CODE_EXTENSIONS.has(extname(fp)) || !existsSync(fp)) continue;
    try {
      const lines = countLines(readFileSync(fp, "utf-8"));
      if (lines > max) violations.push(`${basename(fp)}: ${lines} lines (max ${max})`);
    } catch { /* unreadable file — skip, matches Python's OSError pass */ }
  }
  return violations;
}

/**
 * Handle TaskCompleted: re-measure the session's modified code files and emit a
 * `SOLID VIOLATION` additionalContext listing any file over the line ceiling.
 * Ports `task-completed/validate-task-solid.py`.
 * @param payload - The TaskCompleted hook payload (`task_id`, `task_subject`, `session_id`).
 * @param home - Home dir (defaults to `~`).
 * @returns The native hook stdout, or `""` when there are no violations.
 */
export function validateTaskSolid(payload: Record<string, unknown>, home: string = homedir()): string {
  const sid = sanitizeSessionId(payload.session_id ?? "unknown");
  if (!sid) return "";
  const changes = loadSessionState(sid, home).changes as Changes | undefined;
  const files = changes?.modifiedFiles ?? [];
  if (files.length === 0) return "";
  const max = resolveMaxLines();
  const violations = collectViolations(files, max);
  if (violations.length === 0) return "";
  const taskId = String(payload.task_id ?? "");
  const subject = String(payload.task_subject ?? "");
  const msg =
    `SOLID VIOLATION in task '${subject}' (${taskId}): ` +
    `${violations.length} file(s) exceed ${max} lines: ` +
    violations.slice(0, 5).join("; ");
  return contextResponse("TaskCompleted", msg);
}
