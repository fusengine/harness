/**
 * @module motion/forgery
 * The approval code is shown in the deny message, so an agent could replay the
 * exact `MOTION-APPROVE <stage> <code>` prompt through a channel that reaches
 * UserPromptSubmit without `agent_id` (a scheduled task, a nested `claude -p
 * --resume`). Refuse any tool call that carries the approval phrase on such a path.
 */
import type { Prompt } from "../../prompt/types";
import { expansionText } from "./shell-verbs";

const PHRASE = /MOTION-APPROVE/i;
/** Tools that can queue a prompt for later or send one to a session. */
const DEFERRED_TOOL = /cron|schedule|wakeup|remotetrigger|sendmessage/i;

function block(detail: string): Prompt {
  return {
    kind: "block",
    title: "Motion approval forgery guard",
    reason: `Approvals come only from the owner typing MOTION-APPROVE <stage> <code> in their own session; an agent cannot relay that phrase (${detail}).`,
  };
}

/**
 * Detect an agent attempt to inject the approval prompt from a non-human channel.
 * @param tool - Tool name.
 * @param command - `tool_input.command` (Bash).
 * @param input - Full `tool_input` object.
 * @returns A block prompt, or `null` when the call does not carry the phrase on such a path.
 */
export function approvalForgeryViolation(tool: string, command: string | undefined, input: Record<string, unknown>): Prompt | null {
  if (tool === "Bash") {
    if (!command) return null;
    const resume = /(?:^|[\s/])(?:claude|codex|cursor-agent|gemini|kimi)(?=\s)/.test(command)
      && /(?:^|\s)(?:--resume|--continue|--session|--last|-r|-c|-C|-S|resume)(?=\s|=|$)/.test(command);
    const dynamic = /[$`<>]/.test(expansionText(command)) || /\$'/.test(command);
    return PHRASE.test(command) || PHRASE.test(expansionText(command)) || (resume && dynamic)
      ? block("Bash approval phrase or non-literal resumed session prompt") : null;
  }
  if (!DEFERRED_TOOL.test(tool)) return null;
  let text = "";
  try {
    text = JSON.stringify(input) ?? "";
  } catch {
    return block(`${tool} with an unserializable input`);
  }
  return PHRASE.test(text) ? block(`${tool} carrying the approval phrase`) : null;
}
