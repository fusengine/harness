/**
 * @module burst-window
 * Single source of truth for the multi-plugin hook fan-out window.
 *
 * Every DEPLOYED plugin registers its OWN PreToolUse/PostToolUse hook, so ONE
 * Claude tool event spawns ~11 sibling harness processes that each record the
 * same deny / one-shot / sniper reminder within milliseconds. Left unchecked
 * the deny-loop counter jumped by ~11 per real attempt ([REPEAT] "#9" on the
 * FIRST try), the one-shot metric inflated ~11×, and the sniper reminder was
 * injected ~11× (token noise).
 *
 * A record landing within this window after an identical prior one (same
 * operation hash + same `session_id`) is treated as the SAME event and folded
 * into it instead of re-counted. Two REAL agent retries are always spaced
 * further apart than the burst, so this never masks a genuine loop. No env var:
 * the fan-out is a physical property of the installed plugin set, not policy.
 * @packageDocumentation
 */

/** Fan-out dedup window (ms). The ~11 sibling hooks for one event land in <2s. */
export const BURST_DEDUP_MS = 2000;
