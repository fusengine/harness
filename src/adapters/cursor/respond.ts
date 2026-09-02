import { formatPrompt, type Prompt } from "../../prompt/types";
import { cursorEventContract } from "./events";
import { parseNativeCursorStdout } from "./native-response";
import { capAdditionalContext } from "./context-limit";
import { capAdditionalContextWithBudget } from "./context-budget";
import type { CursorBudgetContext } from "./interfaces/context-budget";

const AGENT_MESSAGE_EVENTS = new Set([
  "preToolUse",
  "beforeShellExecution",
  "beforeMCPExecution",
]);
const USER_MESSAGE_EVENTS = new Set([
  "preToolUse",
  "beforeShellExecution",
  "beforeMCPExecution",
  "beforeReadFile",
  "subagentStart",
]);

function permissionMessages(eventName: string, userMessage?: string, agentMessage?: string): Record<string, string> {
  return {
    ...(userMessage && USER_MESSAGE_EVENTS.has(eventName) ? { user_message: userMessage } : {}),
    ...(agentMessage && AGENT_MESSAGE_EVENTS.has(eventName) ? { agent_message: agentMessage } : {}),
  };
}

function joinMessages(...values: unknown[]): string {
  return values.filter((value): value is string => typeof value === "string" && value.length > 0).join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Render a portable policy prompt using the native Cursor event contract.
 * Switches exhaustively on {@link CursorResponseKind} — the `never` default
 * fails to compile if a new kind is ever added without a matching case.
 * `contract.known === false` is not tested separately: the single
 * `UNKNOWN_EVENT` fallback in events.ts always pairs `known: false` with
 * `response: "neutral"`, so both collapse to the same `"{}"` branch.
 */
export function toCursorResponse(prompt: Prompt, eventName: string): string {
  const contract = cursorEventContract(eventName);
  const message = formatPrompt(prompt);
  switch (contract.response) {
    case "neutral":
    case "plugin-paths":
      return "{}";
    case "post-context":
    case "session-context":
      return capAdditionalContext(JSON.stringify({ additional_context: message }));
    case "followup":
      return JSON.stringify({ followup_message: message });
    case "compact-notice":
      return JSON.stringify({ user_message: prompt.userMessage ?? message });
    case "submit-control":
      return JSON.stringify({ continue: prompt.kind !== "block", user_message: prompt.userMessage ?? message });
    case "permission": {
      if (prompt.kind === "inform") {
        return JSON.stringify({
          permission: "allow",
          ...permissionMessages(eventName, prompt.userMessage, prompt.reason ? message : undefined),
        });
      }
      const userMessage = prompt.kind === "ask"
        ? `[downgraded from ask — Cursor does not enforce approval for this event]\n${message}`
        : message;
      return JSON.stringify({
        permission: "deny",
        ...permissionMessages(eventName, userMessage, userMessage),
      });
    }
    default: {
      const exhaustive: never = contract.response;
      return exhaustive;
    }
  }
}

/**
 * Convert a shared lifecycle handler's output to the native Cursor envelope.
 * The `neutral` and empty-`text` short circuits run before the switch (they
 * apply identically across several {@link CursorResponseKind} values), so
 * only the remaining 7 kinds need a case — `never` below still catches a
 * future kind added without updating this function. This is the single
 * point every Cursor stdout passes through exactly once (see `handle.ts`'s
 * `handleHook`), so `budget` — when supplied — is reserved from and
 * recorded into here, never at the inner `toCursorResponse` pre-cap (that
 * one's output is re-capped here again on the native-passthrough branch
 * below, so budgeting it too would double-count the same contribution).
 * @param stdout - The shared handler's raw stdout for this hook invocation.
 * @param eventName - Cursor's raw `hook_event_name`.
 * @param budget - Shared `additional_context` budget context (see
 * {@link CursorBudgetContext}); `undefined` falls back to the flat
 * per-response 10,000-char cap, unbudgeted.
 */
export function toCursorLifecycleResponse(stdout: string, eventName: string, budget?: CursorBudgetContext): string {
  const contract = cursorEventContract(eventName);
  const native = parseNativeCursorStdout(stdout, eventName);
  if (native !== null) return capAdditionalContextWithBudget(native, budget);
  let text = stdout;
  let decision: "allow" | "deny" | "ask" | undefined;
  let userMessage = "";
  let agentMessage = "";
  let decisionMessage = "";
  let structured = false;
  try {
    const parsed: unknown = JSON.parse(stdout);
    const subagentAsk = eventName === "subagentStart" && isRecord(parsed)
      && Object.hasOwn(parsed, "permission") && parsed.permission === "ask";
    const shared = (isRecord(parsed) ? parsed : {}) as {
      hookSpecificOutput?: {
        additionalContext?: string;
        permissionDecision?: "allow" | "deny" | "ask";
        permissionDecisionReason?: string;
      };
      systemMessage?: string;
      user_message?: string;
      reason?: string;
      followup_message?: string;
    };
    structured = true;
    decision = shared.hookSpecificOutput?.permissionDecision ?? (subagentAsk ? "ask" : undefined);
    userMessage = shared.systemMessage
      ?? (subagentAsk && Object.hasOwn(shared, "user_message") && typeof shared.user_message === "string"
        ? shared.user_message : "");
    decisionMessage = joinMessages(shared.hookSpecificOutput?.permissionDecisionReason, shared.reason);
    agentMessage = joinMessages(shared.hookSpecificOutput?.additionalContext, decisionMessage);
    text = joinMessages(agentMessage, userMessage, shared.followup_message);
  } catch {
    text = stdout;
  }
  if (contract.response === "neutral") return "{}";
  if (!text) return contract.response === "permission" ? '{"permission":"allow"}' : "{}";
  switch (contract.response) {
    case "session-context":
    case "post-context":
      return capAdditionalContextWithBudget(JSON.stringify({ additional_context: text }), budget);
    case "permission": {
      const permission = decision === "deny" || decision === "ask" ? "deny" : "allow";
      const denied = permission === "deny";
      // Cursor subagentStart can gate creation but has no model-context channel.
      // Drop shared context and its "injected" notice on allow: preserving either
      // would claim delivery the native event contract cannot perform.
      if (eventName === "subagentStart" && !denied) return '{"permission":"allow"}';
      return JSON.stringify({
        permission,
        ...permissionMessages(
          eventName,
          userMessage || (denied ? decisionMessage || agentMessage : ""),
          agentMessage || (denied ? decisionMessage || userMessage : structured ? "" : text),
        ),
      });
    }
    case "followup":
      return JSON.stringify({ followup_message: text });
    case "compact-notice":
      return JSON.stringify({ user_message: text });
    case "submit-control":
      return JSON.stringify({ continue: true, user_message: text });
    case "plugin-paths":
      return "{}";
    default: {
      const exhaustive: never = contract.response;
      return exhaustive;
    }
  }
}
