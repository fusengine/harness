/**
 * @module deny-notice
 * Attach a user-visible notice to a deny/ask hook response — the owner-reported
 * gap where `permissionDecision: deny/ask` (the agent-only channel) left the
 * human staring at a silent terminal. Mirrors {@link module:notices}'s
 * compliance notices but for the BLOCKING outcomes those never covered.
 * @packageDocumentation
 */
import figures from "figures";
import type { Prompt } from "../prompt/types";
import { attachSystemMessage } from "../adapters/claude";
import { onceExclusive } from "./inject-dedup";
import { BURST_DEDUP_MS } from "./burst-window";

/**
 * The human-facing line for a block/ask outcome: the gate's own
 * {@link Prompt.userMessage} when it set one, else a generic symbol + title —
 * text-presentation Unicode only (`figures.cross`/`?`), never emoji: terminal-safe,
 * single-cell width, with the Windows fallbacks `figures` already resolves, matching
 * the existing notice family (`notices.ts`'s `✓`/`⚠`, left untouched by this module).
 * Null for `inform` ({@link module:respond}'s own `userMessage` path already
 * covers it) or when neither applies.
 */
export function denyAskNotice(prompt: Prompt): string | null {
  if (prompt.kind === "block") return prompt.userMessage ?? `${figures.cross} ${prompt.title}`;
  if (prompt.kind === "ask") return prompt.userMessage ?? `? ${prompt.title}`;
  return null;
}

/**
 * Attach {@link denyAskNotice} onto an already-rendered deny/ask `stdout`, for
 * the harnesses whose human channel is `systemMessage` (claude-code/codex —
 * `permissionDecision`/`permissionDecisionReason` stay byte-intact, only the
 * top-level field is added). Every other harness passes `stdout` through
 * unchanged: Cursor already emits `user_message` natively (respond.ts), Hermes
 * and cline have no human channel. Deduped via {@link onceExclusive} against
 * the ~11 sibling-plugin fan-out for one real event (same window as the
 * sniper reminder / compliance notices).
 * @param id - Harness id (`ctx.id` from `PreContext`).
 * @param stdout - The rendered hook response (from {@link module:respond.respond}).
 * @param prompt - The {@link Prompt} that produced `stdout`.
 * @param sessionId - Current session id (dedup scope).
 * @param dir - State-dir for the dedup marker (per-project state dir).
 * @param now - Event clock (tests pass a fake one).
 */
export function withDenyNotice(id: string, stdout: string, prompt: Prompt, sessionId: string, dir: string, now?: number): string {
  if (id !== "claude-code" && id !== "codex") return stdout;
  const notice = denyAskNotice(prompt);
  if (!notice) return stdout;
  if (!onceExclusive(`deny-notice:${sessionId}:${prompt.title}`, BURST_DEDUP_MS, { now, dir })) return stdout;
  return attachSystemMessage(stdout, notice);
}
