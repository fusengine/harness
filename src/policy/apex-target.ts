/**
 * Harness-target helpers for the APEX context builders. Single source of
 * truth for the home-dir segment / root doc name / plan-tool idiom that
 * differ between Claude Code and Codex (and beyond), so the builders in
 * `claude-md-context.ts`, `apex-task-context.ts`, and `inject-apex.ts` never
 * hardcode `.claude`/`CLAUDE.md`/`TaskCreate` again. Runtime `id` values flow
 * through the pipeline as plain `string` (see `handleHook(id: string, ...)`),
 * so these helpers accept `string` and narrow internally — same idiom as the
 * existing `HOME_DIR[id] ?? ".claude"` precedent in `cartographer/detect.ts`.
 */
import { HOME_DIR } from "../config/dotenv";
import type { HarnessId } from "../detect/interfaces/types";

/**
 * Home-dir segment for a harness target (".claude", ".codex", ...). Falls
 * back to ".claude" for any harness without a {@link HOME_DIR} entry.
 * @param id - Harness id (e.g. "claude-code", "codex").
 * @returns The home-dir segment, e.g. ".claude".
 */
export function harnessHomeSegment(id: string): string {
  return HOME_DIR[id as HarnessId] ?? ".claude";
}

/**
 * Root instructions doc name for a harness target: "AGENTS.md" for Codex,
 * "CLAUDE.md" for every other target (including the default/unknown fallback).
 * @param id - Harness id.
 * @returns The doc file name.
 */
export function apexDocName(id: string): string {
  return id === "codex" ? "AGENTS.md" : "CLAUDE.md";
}

/**
 * Native plan/track tool name for a harness target: Codex's `update_plan` vs
 * Claude's `TaskCreate`. Covers only the PLAN-step line — other Claude-only
 * tool references (`TaskList`, `TaskUpdate`) are branched inline by the
 * builders since their surrounding prose differs structurally, not just by token.
 * @param id - Harness id.
 * @returns The plan-tool name.
 */
export function apexPlanTool(id: string): string {
  return id === "codex" ? "update_plan" : "TaskCreate";
}
