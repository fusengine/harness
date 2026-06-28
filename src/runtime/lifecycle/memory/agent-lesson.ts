/**
 * SubagentStop memory handler. Ports `capture-agent-lesson.py`: log a finished
 * agent's conclusion and, when salient enough, store it as a Graphiti episode.
 * Skips explore-codebase/websearch agents and errored exits.
 */
import { isoUtc } from "../security/skill-state";
import { postEpisode } from "./client";
import { SALIENCE_THRESHOLD, agentSeverity, salience } from "./salience";
import { appendMemoryLog } from "./state";

/** Agents whose conclusions are never captured. */
const SKIP = new Set(["explore-codebase", "websearch"]);

/**
 * Handle SubagentStop: log + maybe store the agent's conclusion. Side-effect
 * only (no stdout).
 * @param payload - The raw hook payload.
 * @param now - Clock.
 */
export async function captureAgentLesson(payload: Record<string, unknown>, now: number): Promise<void> {
  const name = typeof payload.agent_name === "string" ? payload.agent_name : "unknown";
  const lastMsg = typeof payload.last_assistant_message === "string" ? payload.last_assistant_message : "";
  const exitReason = typeof payload.exit_reason === "string" ? payload.exit_reason : "unknown";
  if (!lastMsg || exitReason === "error" || SKIP.has(name)) return;
  const lesson = lastMsg.slice(0, 1000);
  const ts = isoUtc(now);
  appendMemoryLog("agent-lessons.log", `[${ts}] ${name} | ${exitReason} | ${lesson.slice(0, 80)}...`);
  if (salience(agentSeverity(name)) <= SALIENCE_THRESHOLD) return;
  await postEpisode({
    name: "agent_lesson",
    episode_body: `Agent ${name} conclusion: ${lesson}`,
    source_description: `agent-stop-${name}`,
    reference_time: ts,
  });
}
