import { sessionStartCore } from "./session-start";
import { injectRules } from "./inject-rules";
import { solidDetectStart } from "./solid-detect";
import { subagentCacheContext } from "./subagent-cache";
import { trackAgentMemory } from "./agent-memory";
import { harvestSubagentTrack } from "../../freshness/evidence-harvest-io";
import { validateTeammateOutput } from "./teammate-idle";
import { logToolFailure } from "./tool-failure";
import { saveApexState } from "./pre-compact";
import { cleanupSession } from "./session-end";
import { validateRulesLoaded } from "./instructions-loaded";
import { validateTaskSolid } from "./task-completed";
import { cartoSessionStart } from "./cartographer/session-start";
import { dispatchLessons } from "./lessons/dispatch";

/** Which plugin's hooks.json invoked the harness (selects SessionStart behavior). */
export type PluginScope = "core" | "solid" | "rules" | "carto" | "security" | "changelog" | "aipilot" | "lessons" | "seo" | "memory" | "tailwindcss";

/** Inputs the lifecycle dispatcher needs (clock + roots injected). */
export interface LifecycleInput {
  event: string;
  payload: Record<string, unknown>;
  cwd: string;
  scope: PluginScope;
  now: number;
}

/** SessionStart handler keyed on plugin scope. */
function sessionStart(input: LifecycleInput): string {
  if (input.scope === "solid") return solidDetectStart();
  if (input.scope === "rules") return injectRules(process.env.CLAUDE_PLUGIN_ROOT ?? input.cwd);
  if (input.scope === "carto") return cartoSessionStart(input.cwd, input.now);
  if (input.scope === "lessons") return dispatchLessons("SessionStart", input.payload, input.cwd, input.now);
  return sessionStartCore(input.cwd, undefined, input.now);
}

/**
 * Route a lifecycle/session/context hook event to its ported handler. Returns
 * the native stdout when handled, or `null` when the event is not a lifecycle
 * event (so the caller falls through to the PreToolUse/PostToolUse pipeline).
 * @param input - The dispatch input.
 * @returns The native hook stdout, or `null` when unhandled.
 */
export function dispatchLifecycle(input: LifecycleInput): string | null {
  switch (input.event) {
    case "SessionStart":
      return sessionStart(input);
    case "UserPromptSubmit":
      return input.scope === "rules" ? injectRules(process.env.CLAUDE_PLUGIN_ROOT ?? input.cwd) : null;
    case "SubagentStart":
      if (input.scope === "aipilot") return "";
      if (input.scope === "lessons") return dispatchLessons("SubagentStart", input.payload, input.cwd, input.now);
      return subagentCacheContext(input.payload.session_id);
    case "Stop":
      return input.scope === "lessons" ? dispatchLessons("Stop", input.payload, input.cwd, input.now) : null;
    case "SubagentStop":
      if (input.scope === "aipilot") return "";
      // Retroactively harvest the finishing sub-agent's transcript into the session
      // track BEFORE the reminder — so next turn's freshness gate sees research/
      // explore evidence even when sidechain PostToolUse hooks never fired
      // (#43612/#27655/#34692). SubagentStop is main-session-dispatched (reliable).
      harvestSubagentTrack(input.payload, input.cwd, input.now);
      return trackAgentMemory(input.payload, undefined, input.now);
    case "TeammateIdle":
      return validateTeammateOutput(input.payload);
    case "PostToolUseFailure":
      logToolFailure(input.payload, undefined, input.now);
      return "";
    case "PreCompact":
      return saveApexState(input.cwd, input.now);
    case "SessionEnd":
      if (input.scope !== "aipilot") cleanupSession(undefined, input.now);
      return "";
    case "InstructionsLoaded":
      validateRulesLoaded(input.payload);
      return "";
    case "TaskCompleted":
      return validateTaskSolid(input.payload);
    default:
      return null;
  }
}

export { dispatchAipilot, aipilotPostToolUse } from "./aipilot/dispatch-aipilot";
