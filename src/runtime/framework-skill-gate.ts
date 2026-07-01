import { frameworkSolidGate } from "../policy/framework-solid";
import { skillTriggerGate } from "../policy/skill-triggers";
import { requiredArchSkill } from "../policy/detect-project";
import { countFrameworkCodeLines } from "../policy/file-size";
import type { GateInput } from "./gate-input";
import type { Prompt } from "../prompt/types";

/**
 * Effective line count for the SOLID size check. On an Edit, `content` is only
 * the `new_string` snippet, so for Next.js — mirroring the base file-size guard
 * and the Python `get_full_file_content` — judge the larger of the snippet and
 * the full on-disk file (`existingCodeLines`). Other frameworks (react/laravel/
 * swift) judge the edited snippet alone, never the on-disk full-file max — their
 * Python source never imports `get_full_file_content`, only nextjs does. On
 * Write, `content` IS the full file, so the snippet count stands regardless of
 * framework (undefined → the gate falls back to `countFrameworkCodeLines`).
 * @param tool - the tool name ("Edit" | "Write" | ...).
 * @param framework - the detected framework; only "nextjs" applies the full-file max.
 * @param content - the written content (snippet on Edit, full file on Write).
 * @param existingCodeLines - full on-disk code-only line count, when known.
 */
function effectiveLines(
  tool: string,
  framework: string,
  content: string,
  existingCodeLines?: number,
): number | undefined {
  if (tool !== "Edit" || existingCodeLines === undefined) return undefined;
  if (framework !== "nextjs") return countFrameworkCodeLines(content);
  return Math.max(countFrameworkCodeLines(content), existingCodeLines);
}

/**
 * Framework-aware SOLID + sub-skill gate, run on the Write/Edit path once a
 * `filePath` is present. Combines:
 *  - {@link frameworkSolidGate}: framework-specific SOLID rules (line limits,
 *    interface/protocol separation, `'use client'`, @MainActor...).
 *  - {@link skillTriggerGate}: blocks when written APIs need a sub-skill that
 *    was not read this session, also forcing the modular-architecture skill
 *    resolved from disk via {@link requiredArchSkill}.
 *
 * @param input - the gated tool-use (filePath + content + framework + cwd).
 * @param refsRead - in-session read reference paths (from the loaded track).
 * @param existingCodeLines - full on-disk code-only line count (so an Edit on
 *   an oversized file still fires the framework SOLID size rule). Omit on Write.
 * @returns the first blocking {@link Prompt}, or `null` to allow.
 */
export function frameworkSkillGate(
  input: GateInput,
  refsRead: string[],
  existingCodeLines?: number,
): Prompt | null {
  if (!input.filePath) return null;
  const content = input.content ?? "";
  const solid = frameworkSolidGate(input.filePath, content, effectiveLines(input.tool, input.framework, content, existingCodeLines));
  if (solid) return solid;
  const forced = input.cwd ? requiredArchSkill(input.cwd) : null;
  return skillTriggerGate(input.framework, content, refsRead, forced, input.cwd, input.filePath);
}
