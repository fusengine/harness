import { homedir } from "node:os";
import { addActiveCritic, removeActiveCritic, isCriticAgentType } from "../../policy/motion/critic-flag";

/**
 * SubagentStart/SubagentStop: track active `motion-critic` agents per session.
 * Removal is by `agent_id` ALONE, whatever the `agent_type` (a stuck flag would
 * sandbox the whole session forever).
 * @param event - Raw hook event name.
 * @param payload - Raw hook payload.
 * @param sessionId - Normalized session id.
 * @param home - OS home override.
 */
export function motionSubagent(event: string, payload: Record<string, unknown>, sessionId: string, home: string = homedir()): void {
  const agentId = typeof payload.agent_id === "string" ? payload.agent_id : "";
  if (!agentId) return;
  if (event === "SubagentStop") {
    removeActiveCritic(sessionId, agentId, home);
    return;
  }
  const agentType = typeof payload.agent_type === "string" ? payload.agent_type : "";
  if (isCriticAgentType(agentType)) addActiveCritic(sessionId, agentId, home);
}
