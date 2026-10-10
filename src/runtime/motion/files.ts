import { isAbsolute, resolve } from "node:path";
import type { Prompt } from "../../prompt/types";
import type { MotionProject } from "../../policy/interfaces/motion";
import { selfApprovalViolation } from "../../policy/motion/self-approval";
import { findSensitive } from "../../policy/motion/sensitive";
import { shellOutputRedirects } from "../../policy/guards/bash-write-redirects";
import { extraBashWriteTargets } from "../prd/prd-bash-targets";
import { canonicalFilePath } from "../prd/prd-canon";
import type { NormalizedEvent } from "../normalize";
import { isUnder } from "../../policy/motion/paths";

/** True when the abs `path` is `dir` or lies under it. */
export { isUnder } from "../../policy/motion/paths";

/** The `*** ...` marker lines of a raw patch (paths live there, including `Move to:` sources). */
function patchHeaders(event: NormalizedEvent): string {
  const raw = typeof event.input.command === "string" ? event.input.command : typeof event.input.patch === "string" ? event.input.patch : "";
  return raw.split("\n").filter((l) => l.startsWith("*** ")).join("\n");
}

/**
 * Self-approval check for multi-file writers (Codex `apply_patch`, Hermes `patch`):
 * every fanned-out path AND the raw patch marker lines are tested against the store.
 * @param event - Normalized event (`files` fanned out by the normalizer / host view).
 * @returns A block prompt, or `null`.
 */
export function patchSelfApproval(event: NormalizedEvent, cwd: string = process.cwd(), home?: string): Prompt | null {
  if (!event.files) return null;
  for (const f of event.files) {
    const v = selfApprovalViolation("Write", f.filePath, undefined, cwd, home);
    if (v) return v;
  }
  const headers = patchHeaders(event);
  return headers ? selfApprovalViolation("Write", headers, undefined, cwd, home) : null;
}

/**
 * First banned term written into the project source by any fanned-out file.
 * @param event - Normalized event.
 * @param project - Resolved motion project.
 * @param cwd - Directory relative paths resolve against.
 * @param banned - Banned terms.
 */
export function patchSensitive(event: NormalizedEvent, project: MotionProject, cwd: string, banned: string[]): string | null {
  for (const f of event.files ?? []) {
    const abs = isAbsolute(f.filePath) ? resolve(f.filePath) : resolve(cwd, f.filePath);
    const hit = isUnder(canonicalFilePath(abs), canonicalFilePath(project.sourceDir)) ? findSensitive(f.content, banned) : null;
    if (hit) return hit;
  }
  return null;
}

/** Scan Bash text when an output redirect or known write verb targets motion sources.
 * @param command - Shell command, including literal echo/printf/tee/heredoc text.
 * @param project - Resolved motion project.
 * @param cwd - Working directory for relative targets.
 * @param banned - User-level banned terms.
 * @returns A redacted hit or null when no sensitive source write is detected.
 */
export function bashSensitive(command: string, project: MotionProject, cwd: string, banned: string[]): string | null {
  const targets = [...shellOutputRedirects(command).map((r) => r.target), ...extraBashWriteTargets(command)];
  const source = canonicalFilePath(project.sourceDir);
  return targets.some((p) => isUnder(canonicalFilePath(resolve(cwd, p)), source)) ? findSensitive(command, banned) : null;
}
