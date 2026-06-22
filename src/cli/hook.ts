import { guard as claudeGuard, type ClaudeHookInput } from "../adapters/claude";
import {
  afterFileEdit, beforeShellExecution,
  type CursorEditPayload, type CursorShellPayload,
} from "../adapters/cursor";
import { preToolUse as clinePreToolUse, type ClineHookInput } from "../adapters/cline";
import { beforeTool, type GeminiHookInput } from "../adapters/gemini";

/** What the hook dispatcher should print + exit with. */
export interface HookOutcome {
  stdout: string;
  exit: number;
}

/**
 * Route a harness hook payload to its adapter and produce the native response.
 * The deny/ask decision lives in `stdout` (the harness parses it); exit stays 0.
 */
export function dispatchHook(id: string, payload: Record<string, unknown>): HookOutcome {
  switch (id) {
    case "claude-code":
    case "codex": {
      return { stdout: claudeGuard(payload as ClaudeHookInput) ?? "", exit: 0 };
    }
    case "cursor": {
      if (payload.hook_event_name === "afterFileEdit") {
        afterFileEdit(payload as CursorEditPayload);
        return { stdout: "", exit: 0 };
      }
      return { stdout: JSON.stringify(beforeShellExecution(payload as CursorShellPayload)), exit: 0 };
    }
    case "cline":
      return { stdout: JSON.stringify(clinePreToolUse(payload as ClineHookInput)), exit: 0 };
    case "gemini-cli":
      return { stdout: JSON.stringify(beforeTool(payload as GeminiHookInput)), exit: 0 };
    default:
      return { stdout: "", exit: 0 };
  }
}
