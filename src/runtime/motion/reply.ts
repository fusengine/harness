import { blockResponse, contextResponse } from "../../adapters/claude";
import { respond } from "../respond";
import { recordObject } from "../../util/record-object";

const CONTEXT_FIELDS = new Set(["additionalContext", "additional_context", "contextModification", "context", "systemMessage", "user_message", "agent_message", "followup_message"]);

/**
 * Non-blocking context line in the host's NATIVE shape. claude-code and codex
 * keep the Claude `hookSpecificOutput` envelope (unchanged); every other host
 * goes through `respond()` (cursor `user_message`/`additional_context`, gemini
 * `additionalContext`, cline `contextModification`, hermes `{context}`, kimi raw text).
 * @param id - Harness id.
 * @param event - Event name handed to `respond()` (`UserPromptSubmit`, `PostToolUse`, or Cursor's native name).
 * @param title - Short title.
 * @param text - Message body.
 */
export function motionContext(id: string, event: string, title: string, text: string): string {
  if (id === "claude-code" || id === "codex") return contextResponse(event, text);
  return respond(id, { kind: "inform", title, reason: text }, event);
}

/** Append native non-blocking context while preserving the original native decision fields. */
export function appendMotionContext(id: string, event: string, stdout: string, text: string): string {
  if (!text) return stdout;
  const context = motionContext(id, event, "Motion state verification", text);
  if (!stdout) return context;
  let original: Record<string, unknown>;
  try { original = recordObject(JSON.parse(stdout)); }
  catch { return `${stdout}\n${context}`; }
  try {
    const merge = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> => {
      for (const [key, value] of Object.entries(b)) {
        const prior = a[key];
        if (key === "hookSpecificOutput") a[key] = merge(recordObject(prior), recordObject(value));
        else if (CONTEXT_FIELDS.has(key) && typeof value === "string") a[key] = typeof prior === "string" && prior !== value ? `${prior}\n${value}` : value;
      }
      return a;
    };
    return JSON.stringify(merge(original, recordObject(JSON.parse(context))));
  } catch {
    // Kimi has no documented JSON context channel. Keep its denial envelope intact.
    return stdout;
  }
}

/** Native after-tool/Stop refusal; observation-only hosts retain quarantine even when output is ignored. */
export function motionStateResponse(id: string, event: string, text: string): string {
  if (event === "PostToolUseFailure") return motionContext(id, event, "Motion state verification", text);
  if (id === "claude-code" || id === "codex") return blockResponse(text);
  if (id === "kimi" && event !== "Stop") return text;
  return respond(id, { kind: "block", title: "Motion state verification", reason: text }, event);
}
