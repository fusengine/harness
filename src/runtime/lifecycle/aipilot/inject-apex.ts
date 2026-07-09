/**
 * SubagentStart (matcher "") for the ai-pilot scope: inject APEX AGENTS.md +
 * task context + cartographer paths into every sub-agent. Ports
 * `inject-subagent-context.ts`. The core-scope SubagentStart already surfaces
 * the MCP cache table (`subagent-cache.ts`) in a separate hook entry — this
 * handler only emits the APEX/cartographer block, so there is no double-emit.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { readJsonFile } from "../../../util/json-io";
import { readText } from "../../../util/runtime-io";
import { resolveMaxLines } from "../../../config/limits";
import { contextResponse } from "../../../adapters/claude";
import { capFragment } from "../../inject-budget";
import type { ApexTaskFile } from "./types";

type TaskMap = ApexTaskFile["tasks"];

/** Last 3 completed task subjects (newest first), or "none". */
function completedTasks(tasks: TaskMap): string {
  const done = Object.entries(tasks)
    .filter(([, t]) => t.status === "completed")
    .sort((a, b) => (b[1].completed_at ?? "").localeCompare(a[1].completed_at ?? ""))
    .slice(0, 3)
    .map(([id, t]) => `#${id}: ${t.subject}`);
  return done.length > 0 ? done.join(", ") : "none";
}

/** Pending task subjects, or "none". */
function pendingTasks(tasks: TaskMap): string {
  const pending = Object.entries(tasks)
    .filter(([, t]) => t.status === "pending")
    .map(([id, t]) => `#${id}: ${t.subject}`);
  return pending.length > 0 ? pending.join(", ") : "none";
}

/** Cartographer navigation block, or "" when no plugin map is present. */
function cartographerContext(): string {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) return "";
  const pluginsMap = resolve(pluginRoot, "..", ".cartographer", "index.md");
  if (!existsSync(pluginsMap)) return "";
  return `\n### 7. Cartographer Maps\nNavigate branches (index.md) -> leaves link to real files:\n- Plugin skills: ${pluginsMap}\n- Project files: .cartographer/project/index.md`;
}

/**
 * Build the APEX sub-agent injection for SubagentStart, or "" when the project
 * has no `.claude/apex/` dir. Reads AGENTS.md (first 4KB) + task.json.
 * @param cwd - Fallback project root when `CLAUDE_PROJECT_DIR` is unset.
 * @param home - Home dir (unused placeholder; kept for symmetry/testing).
 * @returns The native hook stdout (possibly empty).
 */
export async function injectApexSubagentContext(cwd: string, home: string = homedir()): Promise<string> {
  void home;
  const projectRoot = process.env.CLAUDE_PROJECT_DIR ?? cwd;
  const apexDir = join(projectRoot, ".claude", "apex");
  if (!existsSync(apexDir)) return "";

  const agentsPath = join(apexDir, "AGENTS.md");
  const agents = existsSync(agentsPath) ? readText(agentsPath).slice(0, 4000) : "";
  const taskData = await readJsonFile<ApexTaskFile>(join(apexDir, "task.json"));
  const completed = taskData ? completedTasks(taskData.tasks) : "none";
  const pending = taskData ? pendingTasks(taskData.tasks) : "none";

  const context = `## APEX Sub-Agent Instructions

You are a sub-agent in APEX workflow. Follow these rules:

### 1. AGENTS.md Rules
${agents}

### 2. Task Context
- Last completed: ${completed}
- Pending: ${pending}

### 3. Before Starting Work
- Use TaskUpdate(taskId, status: in_progress) before starting

### 4. SOLID Rules
- Files < ${resolveMaxLines()} lines | Interfaces in src/interfaces/ | JSDoc/PHPDoc required

### 5. Research Before Code
- Use Context7/Exa for docs | Write notes to .claude/apex/docs/

### 6. Before Done (NEVER skip)
- eLicit: self-review with a NAMED elicitation technique; fix findings first
- Verify: run/functional-check your changes (references⇔declarations)

### 7. When Done
- TaskUpdate(taskId, status: completed) triggers auto-commit${cartographerContext()}`;

  return contextResponse("SubagentStart", capFragment("apex-subagent", context));
}
