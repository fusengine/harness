/**
 * Per-target phrasing tables for the APEX task-tracking step trio/pair
 * (view-pending / mark-in-progress / mark-done) — split out of
 * `apex-target.ts` to keep both files under the SOLID 100-line ceiling.
 * Kimi Code CLI's native tool is `TodoList` (single tool, full-list re-emit
 * per call; status enum is `pending | in_progress | done` — never
 * `completed`, that is Claude's idiom; omitting `todos` queries the current
 * list without mutating it). Kimi has no documented auto-commit tied to a
 * status transition, unlike Claude's `TaskUpdate(completed)` — so these
 * phrasings must NOT promise one. `TaskList` is a distinct Kimi tool for
 * async background tasks and must never be used here.
 */
import type { HarnessId } from "../detect/interfaces/types";
import type { ApexTaskSteps, ApexAgentSteps } from "./interfaces/types";

/** Codex/Kimi step-trio overrides; any other target falls back to {@link DEFAULT_TASK_STEPS}. */
const TASK_STEPS: Partial<Record<HarnessId, ApexTaskSteps>> = {
  codex: {
    step3: "update_plan → review the current plan",
    step4: "update_plan → mark the active step in_progress before starting",
    step7: "update_plan → mark the step completed when done",
  },
  kimi: {
    step3: "TodoList → review the current list (omit todos to query)",
    step4: "TodoList → mark the active item in_progress before starting",
    step7: "TodoList → mark the item done when finished",
  },
};

/** Default (Claude Code) step trio — zero-regression fallback for any unlisted target. */
const DEFAULT_TASK_STEPS: ApexTaskSteps = {
  step3: "TaskList → see pending tasks",
  step4: "TaskUpdate(in_progress) → before starting",
  step7: "TaskUpdate(completed) → triggers auto-commit",
};

/**
 * Resolve the step3/step4/step7 phrasing for a harness target (APEX
 * task-context injection). Replaces the former `isCodex` binary ternary.
 * @param id - Harness id.
 * @returns The {@link ApexTaskSteps} for that target.
 */
export function apexTaskSteps(id: string): ApexTaskSteps {
  return TASK_STEPS[id as HarnessId] ?? DEFAULT_TASK_STEPS;
}

/** Codex/Kimi before/done overrides; any other target falls back to {@link DEFAULT_AGENT_STEPS}. */
const AGENT_STEPS: Partial<Record<HarnessId, ApexAgentSteps>> = {
  codex: {
    beforeStart: "Use update_plan → mark the active step in_progress before starting",
    whenDone: "update_plan → mark the step completed when done",
  },
  kimi: {
    beforeStart: "Use TodoList → mark the active item in_progress before starting",
    whenDone: "TodoList → mark the item done when finished",
  },
};

/** Default (Claude Code) before/done pair — zero-regression fallback for any unlisted target. */
const DEFAULT_AGENT_STEPS: ApexAgentSteps = {
  beforeStart: "Use TaskUpdate(taskId, status: in_progress) before starting",
  whenDone: "TaskUpdate(taskId, status: completed) triggers auto-commit",
};

/**
 * Resolve the beforeStart/whenDone phrasing for a harness target (APEX
 * sub-agent injection). Replaces the former `isCodex` binary ternary.
 * @param id - Harness id.
 * @returns The {@link ApexAgentSteps} for that target.
 */
export function apexAgentSteps(id: string): ApexAgentSteps {
  return AGENT_STEPS[id as HarnessId] ?? DEFAULT_AGENT_STEPS;
}
