/**
 * @module context-limit
 * Cursor 3.18.25's `hooks-carriers` drops an `additional_context` carrier
 * once `o.length>1e4` — but `o` is the MERGED text of every hook's
 * `additional_context` for that event (concatenated with `"\n\n---\n\n"`
 * before the 10,000-char check), not this harness's response in isolation.
 * Capping our own contribution at {@link ADDITIONAL_CONTEXT_LIMIT} is
 * therefore the LAST-RESORT guard, not the real protection: on its own it
 * only proves OUR piece stays under 10,000, while the total across every
 * hook plugin configured on the same event can still exceed it and get
 * dropped wholesale — measured at ~8,400 chars on `sessionStart` from core
 * plugins alone, close enough to the ceiling that one more plugin tips it
 * over. The actual protection is the cross-process shared budget registry
 * in `./context-budget.ts` (Cursor id only), which reserves a slice of the
 * 10,000 ceiling per (session, event, generation) key BEFORE calling
 * {@link truncateAdditionalContext} here with the reserved amount instead of
 * the flat {@link ADDITIONAL_CONTEXT_LIMIT} — this module stays a pure,
 * budget-agnostic primitive so it keeps working unbudgeted (its historical,
 * still-correct behavior) wherever no budget context is available. The
 * limit unit is UTF-16 code units (`String.prototype.length`), matching
 * `value.length` here exactly. Only 5 events carry `additional_context`
 * through this carrier — sessionStart, beforeSubmitPrompt, preToolUse,
 * postToolUse, postToolUseFailure — subagentStart/subagentStop use a
 * different, unlimited channel. "Drops silently" also only holds when no
 * `failClosed: true` hook is declared on that step/tool: with one declared,
 * an oversized carrier REJECTS the tool call instead of being dropped quiet.
 */

/** Cursor's hard `additional_context` character ceiling. */
export const ADDITIONAL_CONTEXT_LIMIT = 10_000;

/** Suffix appended by {@link truncateAdditionalContext} once a value is cut. */
export const TRUNCATION_MARKER = "\n[fuse-harness] additional_context truncated to Cursor's 10000-char limit";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Truncate a string to end with {@link TRUNCATION_MARKER} once its length
 * exceeds `limit`. Leaves shorter values untouched. Idempotent under a
 * SHRINKING `limit` across repeated calls (e.g. an unbudgeted flat-cap pass
 * followed by a budgeted re-cap of the same stdout — see `./respond.ts`'s
 * `toCursorLifecycleResponse` doc): when `value` already ends with
 * {@link TRUNCATION_MARKER}, that marker is stripped BEFORE re-slicing so the
 * result carries exactly one marker instead of risking a duplicated/cut one.
 * @param value - Candidate `additional_context` body.
 * @param limit - Effective ceiling for this call (defaults to the flat
 * {@link ADDITIONAL_CONTEXT_LIMIT}; a shared-budget caller passes a smaller,
 * per-reservation value instead).
 */
export function truncateAdditionalContext(value: string, limit: number = ADDITIONAL_CONTEXT_LIMIT): string {
  const alreadyMarked = value.endsWith(TRUNCATION_MARKER);
  if (!alreadyMarked && value.length <= limit) return value;
  if (limit <= TRUNCATION_MARKER.length) return TRUNCATION_MARKER.slice(0, Math.max(0, limit));
  const base = alreadyMarked ? value.slice(0, value.length - TRUNCATION_MARKER.length) : value;
  return base.slice(0, limit - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
}

/**
 * Length of a Cursor stdout JSON's `additional_context` string field, or 0
 * when the stdout is not JSON, has no such field, or that field isn't a
 * string.
 * @param stdout - A native Cursor JSON stdout candidate.
 */
export function additionalContextLength(stdout: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return 0;
  }
  return isPlainObject(parsed) && typeof parsed.additional_context === "string" ? parsed.additional_context.length : 0;
}

/**
 * Re-serialize a Cursor stdout string with its `additional_context` field
 * dropped entirely — used once the shared budget has no room left even for
 * a truncated marker. Returns the input byte-for-byte unchanged when it is
 * not JSON or has no string `additional_context` field.
 * @param stdout - A native Cursor JSON stdout candidate.
 */
export function omitAdditionalContext(stdout: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return stdout;
  }
  if (!isPlainObject(parsed) || typeof parsed.additional_context !== "string") return stdout;
  const { additional_context: _omitted, ...rest } = parsed;
  return JSON.stringify(rest);
}

/**
 * Re-serialize a Cursor stdout string with its `additional_context` field
 * capped at `limit` characters. Returns the input byte-for-byte unchanged
 * when it is not JSON, has no string `additional_context` field, or that
 * field is already within the limit — so callers can wrap every return path
 * unconditionally.
 * @param stdout - A native Cursor JSON stdout candidate.
 * @param limit - Effective ceiling for this call (see {@link truncateAdditionalContext}).
 */
export function capAdditionalContext(stdout: string, limit: number = ADDITIONAL_CONTEXT_LIMIT): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return stdout;
  }
  if (!isPlainObject(parsed) || typeof parsed.additional_context !== "string") return stdout;
  const truncated = truncateAdditionalContext(parsed.additional_context, limit);
  if (truncated === parsed.additional_context) return stdout;
  return JSON.stringify({ ...parsed, additional_context: truncated });
}
