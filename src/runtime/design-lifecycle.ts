import { existsSync } from "node:fs";
import { join } from "node:path";
import { detectMode } from "../policy/design/transitions";
import { initDesignState, saveDesignState, cleanupDesignStates } from "../policy/design/state";
import { setActiveDesignAgent, clearActiveDesignAgent } from "../policy/design/flag";

/**
 * Handle the design-agent SubagentStart/Stop lifecycle: init the pipeline state +
 * raise the active flag on start, archive/cleanup + clear the flag on stop.
 * Returns true when it handled the event (caller should respond and stop).
 */
export function designLifecycle(payload: Record<string, unknown>, cacheDir: string, cwd: string, stamp: string, now: number): boolean {
  const event = typeof payload.hook_event_name === "string" ? payload.hook_event_name : "";
  const agentType = typeof payload.agent_type === "string" ? payload.agent_type : "";
  if (!agentType.includes("design")) return false;
  const agentId = typeof payload.agent_id === "string" ? payload.agent_id : "";
  if (event === "SubagentStart") {
    if (!agentId) return false;
    const dsExists = existsSync(join(cwd, "design-system.md"));
    const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
    saveDesignState(cacheDir, initDesignState(agentId, detectMode(prompt, dsExists), dsExists));
    setActiveDesignAgent(cacheDir, agentId);
    return true;
  }
  if (event === "SubagentStop") {
    cleanupDesignStates(cacheDir, agentId, stamp, now);
    clearActiveDesignAgent(cacheDir);
    return true;
  }
  return false;
}
