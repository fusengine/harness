import { homedir } from "node:os";
import { cleanupSession } from "./session-end";
import { validateTaskSolid } from "./task-completed";
import { defaultStateDir } from "../paths";
import { notify } from "../notifications";

/**
 * Handle the core scope's `Stop` event — Codex parity. Codex never emits
 * `SessionEnd`/`TaskCompleted` (codex-plugins/docs/reference/hooks.md,
 * "Harness Runtime Limits": "lifecycle dispatch includes Claude-only names
 * such as TaskCompleted, PostToolUseFailure, and SessionEnd; Codex does not
 * emit those events") but its own hooks.json wires `Stop` to `hook codex
 * core`, and its own docs table defines `Stop` as "turn finishes — cleanup
 * and completion notification". Both ported behaviors collapse onto it here
 * rather than being invented anew: {@link cleanupSession} (normally
 * SessionEnd-only) for cleanup, {@link validateTaskSolid} (normally
 * TaskCompleted-only) for the SOLID/receipt completion check.
 *
 * Claude-side, this branch is unreachable: core-guards' Claude `Stop` hooks
 * are a native `afplay` sound + an LLM `type:"prompt"` check, neither of
 * which invokes the harness binary (see `hooks/hooks.json` in claude-plugins
 * vs codex-plugins) — `dispatchLifecycle`'s `case "Stop"` for scope `"core"`
 * only ever receives a real payload from Codex.
 * @param payload - The raw Stop hook payload.
 * @param cwd - Project root (drives the state dir).
 * @param now - Clock.
 * @returns The native hook stdout ("" when the session is clean).
 */
export function stopCore(payload: Record<string, unknown>, cwd: string, now: number): string {
  cleanupSession(undefined, now);
  // Turn finished — voice the "stop" sound (fire-and-forget, fail-open: never
  // throws, never blocks; a silent no-op when opted out or no sound resolves).
  notify("stop");
  return validateTaskSolid(payload, homedir(), now, defaultStateDir(cwd), "Stop");
}
