import { formatPrompt, type Prompt } from "../../prompt/types";
import { cursorEventContract } from "./events";
import { parseNativeCursorStdout } from "./native-response";

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

/** Render a portable policy prompt using the native Cursor event contract. */
export function toCursorResponse(prompt: Prompt, eventName: string): string {
  const contract = cursorEventContract(eventName);
  const message = formatPrompt(prompt);
  if (!contract.known || contract.response === "neutral" || contract.response === "plugin-paths") return "{}";
  if (contract.response === "post-context" || contract.response === "session-context") {
    return JSON.stringify({ additional_context: message });
  }
  if (contract.response === "followup") return JSON.stringify({ followup_message: message });
  if (contract.response === "compact-notice") return JSON.stringify({ user_message: prompt.userMessage ?? message });
  if (contract.response === "submit-control") {
    return JSON.stringify({ continue: prompt.kind !== "block", user_message: prompt.userMessage ?? message });
  }
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

/** Convert a shared lifecycle handler's output to the native Cursor envelope. */
export function toCursorLifecycleResponse(stdout: string, eventName: string): string {
  const contract = cursorEventContract(eventName);
  const native = parseNativeCursorStdout(stdout, eventName);
  if (native !== null) return native;
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
  if (contract.response === "session-context" || contract.response === "post-context") {
    return JSON.stringify({ additional_context: text });
  }
  if (contract.response === "permission") {
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
  if (contract.response === "followup") return JSON.stringify({ followup_message: text });
  if (contract.response === "compact-notice") return JSON.stringify({ user_message: text });
  if (contract.response === "submit-control") return JSON.stringify({ continue: true, user_message: text });
  return "{}";
}
