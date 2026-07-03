import { basename, extname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { contextResponse } from "../../adapters/claude";
import { resolveMaxLines } from "../../config/limits";
import { resolveTtlSec } from "../../config/ttl";
import { countLines } from "../../policy/file-size";
import { loadSessionState, sanitizeSessionId } from "../home-state";
import { defaultStateDir, trackFile } from "../paths";
import { freshReceiptFromFile } from "../../tracking/receipts";

/** Code-file extensions audited on task completion (mirrors validate-task-solid.py). */
const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".php",
  ".cpp", ".c", ".rb", ".swift", ".kt", ".dart", ".vue", ".svelte", ".astro",
]);

/** Freshness multiple on `FUSE_ENFORCE_TTL_SEC` for receipts (no new env var); a tsc+test run precedes the "done" by more than one edit window. */
const RECEIPT_TTL_MULTIPLIER = 5;

/** Files modified during the session, persisted by {@link trackSessionChanges}. */
interface Changes {
  modifiedFiles?: string[];
}

/** The modified files that are code (by extension) — the receipt gate's trigger set. */
function codeFiles(files: string[]): string[] {
  return files.filter((fp) => CODE_EXTENSIONS.has(extname(fp)));
}

/**
 * Refuse completion when code files changed but no fresh, passing verification
 * receipt (`tsc`/test, exit 0, zero failures, within TTL×{@link RECEIPT_TTL_MULTIPLIER})
 * exists in the signed track. TaskCompleted does NOT honor `decision:"block"`
 * (verified against the official hooks docs — `TeammateIdle/TaskCreated/
 * TaskCompleted` are excluded from that list); the documented stdout refusal is
 * `{"continue":false,"stopReason":…}`, which halts the teammate with the reason
 * shown to the user. Returns that JSON, or `null` when the session is clear.
 */
function receiptGate(sid: string, files: string[], now: number, stateDir: string): string | null {
  if (codeFiles(files).length === 0) return null;
  const windowMs = resolveTtlSec(process.env) * 1000 * RECEIPT_TTL_MULTIPLIER;
  if (freshReceiptFromFile(trackFile(sid, stateDir), windowMs, now)) return null;
  const stopReason =
    "VERIFICATION RECEIPT REQUIRED: code files changed but no fresh passing tsc/test receipt " +
    "exists. Run `bun test` + `tsc --noEmit` (exit 0, 0 failures) and re-complete.";
  return JSON.stringify({ continue: false, stopReason });
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
 * Handle TaskCompleted (ports `task-completed/validate-task-solid.py`, plus the
 * receipt gate). SOLID violations surface first as `SOLID VIOLATION`
 * additionalContext; once the files comply, {@link receiptGate} refuses a "done"
 * that has no fresh passing tsc/test receipt.
 * @param payload - The TaskCompleted payload (`task_id`, `task_subject`, `session_id`).
 * @param home - Home dir (defaults to `~`).
 * @param now - Clock (defaults to `Date.now()`).
 * @param stateDir - Track base dir (defaults to the cwd-derived state dir; matches `handleHook`).
 * @returns The native hook stdout, or `""` when the session is clean.
 */
export function validateTaskSolid(payload: Record<string, unknown>, home: string = homedir(), now: number = Date.now(), stateDir: string = defaultStateDir(process.cwd())): string {
  const sid = sanitizeSessionId(payload.session_id ?? "unknown");
  if (!sid) return "";
  const changes = loadSessionState(sid, home).changes as Changes | undefined;
  const files = changes?.modifiedFiles ?? [];
  if (files.length === 0) return "";
  const max = resolveMaxLines();
  const violations = collectViolations(files, max);
  if (violations.length === 0) return receiptGate(sid, files, now, stateDir) ?? "";
  const taskId = String(payload.task_id ?? "");
  const subject = String(payload.task_subject ?? "");
  const msg =
    `SOLID VIOLATION in task '${subject}' (${taskId}): ` +
    `${violations.length} file(s) exceed ${max} lines: ` +
    violations.slice(0, 5).join("; ");
  return contextResponse("TaskCompleted", msg);
}
