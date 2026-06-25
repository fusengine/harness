/**
 * ai-pilot scope dispatcher: routes Claude lifecycle events to the ported
 * cache/injection handlers by (event, agent_type matcher).
 */
import { injectApexSubagentContext } from "./inject-apex";
import { injectExploreCache } from "./inject-explore";
import { injectDocCache } from "./inject-doc";
import { injectLessonsCache } from "./inject-lessons";
import { injectTestCache } from "./inject-test";
import { cacheDocFromTranscript } from "./cache-doc";
import { cacheSniperLessons } from "./cache-lessons";
import { cacheTestResults } from "./cache-test";
import { cacheAnalyticsSave } from "./analytics";
import { syncTaskTracking } from "./sync-task";
import { contextResponse } from "../../../adapters/claude";

/** The agent_type a SubagentStart/Stop payload reports. */
function agentTypeOf(payload: Record<string, unknown>): string {
  return String(payload.agent_type ?? payload.subagent_type ?? "");
}

/** Extract the `additionalContext` text from a SubagentStart response, or "". */
function contextTextOf(response: string): string {
  if (!response) return "";
  try {
    const parsed = JSON.parse(response) as { hookSpecificOutput?: { additionalContext?: string } };
    return parsed.hookSpecificOutput?.additionalContext ?? "";
  } catch { return ""; }
}

/**
 * Combine two SubagentStart responses into one (Claude concatenates multiple
 * hooks' additionalContext; collapsing two matcher-"" scripts into one dispatch
 * call must do that join itself). Returns "" when both are empty.
 */
function combineContext(a: string, b: string): string {
  const parts = [contextTextOf(a), contextTextOf(b)].filter(Boolean);
  return parts.length ? contextResponse("SubagentStart", parts.join("\n\n")) : "";
}

/** The transcript path a SubagentStop payload reports (Stop-only field). */
function transcriptOf(payload: Record<string, unknown>): string | undefined {
  const t = payload.agent_transcript_path;
  return typeof t === "string" ? t : undefined;
}

/** SubagentStart routing: cache injectors keyed on agent_type. */
async function onSubagentStart(payload: Record<string, unknown>, cwd: string, now: number): Promise<string> {
  const agent = agentTypeOf(payload);
  if (agent.includes("explore-codebase")) return injectExploreCache(cwd, undefined, now);
  if (agent.includes("research-expert")) return injectDocCache(cwd, undefined, now);
  if (agent.includes("sniper")) return injectTestCache(cwd, undefined, now);
  const apex = await injectApexSubagentContext(cwd);
  const lessons = await injectLessonsCache(cwd, undefined, now);
  return combineContext(apex, lessons);
}

/** SubagentStop routing: transcript-driven cache writers (side-effects). */
async function onSubagentStop(payload: Record<string, unknown>, cwd: string): Promise<string> {
  const agent = agentTypeOf(payload);
  const transcript = transcriptOf(payload);
  if (agent.includes("research-expert")) { await cacheDocFromTranscript(transcript, cwd); return ""; }
  if (agent.includes("sniper")) {
    await cacheSniperLessons(transcript, cwd);
    await cacheTestResults(transcript, cwd);
  }
  return "";
}

/**
 * Dispatch an ai-pilot-scope lifecycle event. Returns the native stdout, or
 * `null` when unhandled (caller falls through to the default pipeline).
 */
export async function dispatchAipilot(event: string, payload: Record<string, unknown>, cwd: string, now: number): Promise<string | null> {
  if (event === "SubagentStart") return onSubagentStart(payload, cwd, now);
  if (event === "SubagentStop") return onSubagentStop(payload, cwd);
  if (event === "SessionEnd") { await cacheAnalyticsSave(undefined, now); return ""; }
  return null;
}

/** PostToolUse (TaskCreate/TaskUpdate) sync for the ai-pilot scope. */
export async function aipilotPostToolUse(payload: Record<string, unknown>, cwd: string): Promise<string> {
  return syncTaskTracking(payload, cwd);
}
