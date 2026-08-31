/**
 * Pre-pipeline async scope interception for {@link handleHook}. The aipilot and
 * memory scopes reach external resources (cache files / Graphiti HTTP) and may
 * emit stdout for lifecycle events, so they run before the sync gate pipeline.
 */
import { dispatchAipilot } from "./lifecycle";
import { dispatchMemory } from "./lifecycle/memory/dispatch";
import { cursorEventContract } from "../adapters/cursor/events";
import { toCursorLifecycleResponse } from "../adapters/cursor/respond";
import type { PluginScope } from "./lifecycle";

/**
 * Run the async per-scope dispatcher for the invoking scope, if any.
 * @param scope - The invoking plugin scope.
 * @param event - The raw hook event name.
 * @param payload - The raw hook payload.
 * @param cwd - Project root.
 * @param now - Clock.
 * @param id - Harness target id (defaults to "claude-code" — zero-regression default).
 * @returns The native stdout when intercepted, or `null` to fall through.
 */
export async function asyncScopeStdout(scope: PluginScope | undefined, event: string, payload: Record<string, unknown>, cwd: string, now: number, id: string = "claude-code"): Promise<string | null> {
  const dispatchedEvent = id === "cursor" ? cursorEventContract(event).lifecycle : event;
  if (dispatchedEvent === null) return null;
  let stdout: string | null = null;
  if (scope === "aipilot") stdout = await dispatchAipilot(dispatchedEvent, payload, cwd, now, undefined, id);
  if (scope === "memory") stdout = await dispatchMemory(dispatchedEvent, payload, cwd, now);
  return id === "cursor" && stdout !== null ? toCursorLifecycleResponse(stdout, event) : stdout;
}
