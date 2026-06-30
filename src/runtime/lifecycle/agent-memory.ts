import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { contextResponse } from "../../adapters/claude";
import { loadSessionState, sanitizeSessionId, saveSessionState, sessionsDir } from "../home-state";

/** The `changes` block written by `track-changes.ts` into unified session state. */
interface Changes {
  cumulativeCodeFiles?: number;
  modifiedFiles?: string[];
}

/** `~/.claude/memory/agents` — agent completion history dir. */
function memoryDir(home: string): string {
  return join(home, ".claude", "memory", "agents");
}

const SKIP_AGENTS = /(sniper|sniper-faster|explore-codebase|research-expert|claude-code-guide|Explore|Plan)/;

/** Append the agent completion record to `agent-history.jsonl` (best effort). */
function recordHistory(home: string, agentId: string, agentType: string, ts: string): void {
  const dir = memoryDir(home);
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "agent-history.jsonl"), JSON.stringify({ agentId, agentType, completedAt: ts }) + "\n", "utf-8");
  } catch { /* best effort */ }
}

/**
 * Handle SubagentStop: append the completion to agent-history.jsonl and, for a
 * non-skipped agent that touched code, emit the sniper reminder + reset the
 * counter. Ports `subagent-stop/track-agent-memory.py`.
 * @param data - The raw hook payload.
 * @param home - Home dir (defaults to `~`).
 * @param now - Clock (defaults to `Date.now()`).
 * @returns The native hook stdout (always a JSON message).
 */
export function trackAgentMemory(data: Record<string, unknown>, home: string = homedir(), now: number = Date.now()): string {
  mkdirSync(sessionsDir(home), { recursive: true });
  const agentType = String(data.agent_type ?? data.subagent_type ?? "unknown");
  const sessionId = sanitizeSessionId(data.session_id) ?? "unknown";
  const ts = new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");
  recordHistory(home, String(data.agent_id ?? "unknown"), agentType, ts);
  if (SKIP_AGENTS.test(agentType)) return JSON.stringify({ message: `Agent ${agentType} completed` });
  const state = loadSessionState(sessionId, home);
  const changes = state.changes as Changes | undefined;
  const count = changes?.cumulativeCodeFiles ?? 0;
  if (count > 0) {
    const files = (changes?.modifiedFiles ?? []).join(", ");
    saveSessionState(sessionId, { ...state, changes: { ...changes, cumulativeCodeFiles: 0 } }, home);
    return contextResponse("SubagentStop", `SNIPER VALIDATION REQUIRED: Agent '${agentType}' modified ${count} code file(s): ${files}. Run sniper agent now.`);
  }
  return JSON.stringify({ message: `Agent ${agentType} completed (no code changes)` });
}
