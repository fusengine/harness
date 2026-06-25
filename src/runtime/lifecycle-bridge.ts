import { dispatchLifecycle, postEditTypescript, trackSessionChanges, type PluginScope } from "./lifecycle";
import type { NormalizedEvent } from "./normalize";

/** Raw event name from a payload (Cline lacks one; lifecycle is Claude-only). */
function rawEvent(payload: Record<string, unknown>): string {
  return typeof payload.hook_event_name === "string" ? payload.hook_event_name : "";
}

/**
 * Run the ported lifecycle/session/context hooks (SessionStart, SubagentStart/
 * Stop, TeammateIdle, PostToolUseFailure, PreCompact, SessionEnd,
 * InstructionsLoaded, rules-scope UserPromptSubmit). Returns the native stdout
 * when handled, or `null` to fall through to the tool-use pipeline.
 * @param payload - The raw hook payload.
 * @param cwd - Project root.
 * @param scope - The invoking plugin scope (defaults to `core`).
 * @param now - Clock.
 * @returns The native stdout, or `null` when unhandled.
 */
export function lifecycleStdout(payload: Record<string, unknown>, cwd: string, scope: PluginScope, now: number): string | null {
  return dispatchLifecycle({ event: rawEvent(payload), payload, cwd, scope, now });
}

/**
 * Post-edit additions for core-scope PostToolUse Write/Edit: track cumulative
 * session changes (sniper reminder) + report eslint/prettier issues. Returns the
 * combined extra stdout (track-changes wins; lint appended only when no track
 * output), or "" when nothing to emit.
 * @param scope - The invoking plugin scope.
 * @param event - The normalized event.
 * @param now - Clock.
 * @returns The extra stdout (possibly empty).
 */
export function postEditContext(scope: PluginScope, event: NormalizedEvent, now: number): string {
  if (scope !== "core" || (event.tool !== "Write" && event.tool !== "Edit") || !event.filePath) return "";
  const sniper = trackSessionChanges(event.sessionId, event.filePath, undefined, now);
  return sniper || postEditTypescript(event.filePath);
}
