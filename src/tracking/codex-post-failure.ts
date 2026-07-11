/**
 * @module codex-post-failure
 * Codex has no native `PostToolUseFailure` event (Claude Code's own failure
 * signal, ported in `src/runtime/lifecycle/tool-failure.ts`'s `logToolFailure`)
 * — every Codex tool outcome, success or failure, arrives on the SAME
 * `PostToolUse` event. This infers a failure from the regular payload's
 * `tool_result`/`tool_response` and journals it into the EXISTING one-shot
 * failure tally ({@link recordFailure}) — no new store, no new gate.
 *
 * Design choice (fail-open): a payload this module cannot positively prove
 * failed — `null`/`undefined`, a non-object shape, or any parse exception —
 * classifies as `"success"` (ignored), NEVER `"failure"`. Many legitimate
 * successful tool calls return no structured result at all (see
 * `handle-post.ts`'s `spawn_agent` `tool_response: { nickname: "scout" }`),
 * so treating "can't tell" as a failure would flood the tally with false
 * positives. Only an EXPLICIT signal (non-zero exit, an error field) counts.
 * @packageDocumentation
 */
import { recordFailure } from "./one-shot-failure";
import type { OneShotOpts } from "./one-shot";

/** Truthy interruption markers across harness result shapes (parity `tool-failure.ts`'s `is_interrupt`). */
const INTERRUPT_KEYS = ["is_interrupt", "isInterrupted", "interrupted", "aborted", "cancelled", "canceled"];

/** True when `result` carries any known interruption marker — an interruption is never a failure. */
function isInterruption(result: Record<string, unknown>): boolean {
  return INTERRUPT_KEYS.some((k) => result[k] === true);
}

/** True when `result` reports a non-zero exit code (Bash-shaped tool result). */
function hasNonZeroExit(result: Record<string, unknown>): boolean {
  const exit = result.exit_code ?? result.exitCode;
  return typeof exit === "number" && exit !== 0;
}

/** True when `result` carries an explicit error signal (`error`, `is_error`/`isError`, or `success: false`). */
function hasErrorField(result: Record<string, unknown>): boolean {
  if (result.success === false) return true;
  if (result.is_error === true || result.isError === true) return true;
  const err = result.error;
  return typeof err === "string" ? err.length > 0 : err !== undefined && err !== null;
}

/**
 * Classify a Codex PostToolUse `tool_response`/`tool_result` payload.
 * Fail-open (see module doc): unprovable shapes resolve to `"success"`,
 * never `"failure"`, and this NEVER throws.
 * @param result - The raw result value off the payload (any shape).
 * @returns `"success"` | `"failure"` | `"interrupted"`.
 */
export function classifyCodexOutcome(result: unknown): "success" | "failure" | "interrupted" {
  try {
    if (result === null || typeof result !== "object" || Array.isArray(result)) return "success";
    const r = result as Record<string, unknown>;
    if (isInterruption(r)) return "interrupted";
    if (hasNonZeroExit(r) || hasErrorField(r)) return "failure";
    return "success";
  } catch {
    return "success";
  }
}

/**
 * Journal a Codex tool failure into the existing one-shot failure tally.
 * No-op for `"success"`/`"interrupted"` — only a genuine failure is recorded.
 * @param tool - The tool name.
 * @param result - The raw PostToolUse result payload.
 * @param opts - Clock + state dir (+ optional session id), forwarded as-is to {@link recordFailure}.
 */
export function recordCodexPostFailure(tool: string, result: unknown, opts: OneShotOpts): void {
  if (classifyCodexOutcome(result) !== "failure") return;
  recordFailure(tool, opts);
}
