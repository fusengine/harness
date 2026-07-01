import { existsSync } from "node:fs";
import { join } from "node:path";
import { detectMode } from "../policy/design/transitions";
import { initDesignState, saveDesignState, cleanupDesignStates } from "../policy/design/state";
import { setActiveDesignAgent, clearActiveDesignAgent, activeDesignAgent } from "../policy/design/flag";

/**
 * Handle the design-agent SubagentStart/Stop lifecycle: init the pipeline state +
 * raise the active flag on start, archive/cleanup + clear the flag on stop.
 * Returns true when it handled the event (caller should respond and stop).
 *
 * `SubagentStop` clears the flag whenever `agent_id` matches the currently
 * active one, INDEPENDENTLY of `agent_type` on the stop payload — a stop event
 * is not guaranteed to echo the same `agent_type` string the start event used,
 * and gating the clear on it left the flag stuck (blocking every subsequent
 * top-level Write/Edit in the session — see MEMORY/LESSON.md).
 */
export function designLifecycle(payload: Record<string, unknown>, cacheDir: string, cwd: string, stamp: string, now: number): boolean {
  const event = typeof payload.hook_event_name === "string" ? payload.hook_event_name : "";
  const agentId = typeof payload.agent_id === "string" ? payload.agent_id : "";
  if (event === "SubagentStop") {
    if (!agentId || agentId !== activeDesignAgent(cacheDir)) return false;
    cleanupDesignStates(cacheDir, agentId, stamp, now);
    clearActiveDesignAgent(cacheDir);
    return true;
  }
  const agentType = typeof payload.agent_type === "string" ? payload.agent_type : "";
  if (!agentType.includes("design")) return false;
  if (event === "SubagentStart") {
    if (!agentId) return false;
    const dsExists = existsSync(join(cwd, "design-system.md"));
    const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
    saveDesignState(cacheDir, initDesignState(agentId, detectMode(prompt, dsExists), dsExists));
    setActiveDesignAgent(cacheDir, agentId);
    return true;
  }
  return false;
}
