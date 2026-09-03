/**
 * @module prd-candidate-files
 * Shared candidate-path extraction for a hook event, used by both
 * {@link prdPreGate} and {@link prdPostCheck} — the fanned-out
 * `apply_patch`/`afterFileEdit` set when present, else the single
 * `event.filePath`.
 */
import type { NormalizedEvent } from "../normalize";

/**
 * @param event - The normalized hook event.
 * @param restrictToWrite - When true (PreToolUse — the default), a bare
 * `event.filePath` only counts for `Write`/`Edit` (never a `Read`, which must
 * stay unaffected by the ownership gate). PostToolUse call sites pass
 * `false`: they only ever see a real Write/Edit-shaped event already.
 * @returns The candidate file paths (possibly empty).
 */
export function prdCandidateFiles(event: NormalizedEvent, restrictToWrite = true): string[] {
  if (event.files?.length) return event.files.map((f) => f.filePath);
  if (!event.filePath) return [];
  if (restrictToWrite && event.tool !== "Write" && event.tool !== "Edit") return [];
  return [event.filePath];
}
