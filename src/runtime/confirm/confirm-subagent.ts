import { homedir } from "node:os";
import { parseEnvInt } from "../../config/env";
import { loadSessionState, saveSessionState, sanitizeSessionId } from "../home-state";

/** Env var overriding the G0 cool-down window below (seconds). Unset = the 300s/5min default. */
const CONFIRM_WINDOW_ENV_KEY = "FUSE_CONFIRM_SUBAGENT_WINDOW_SEC";
/** Default G0 cool-down (seconds) when {@link CONFIRM_WINDOW_ENV_KEY} is unset/invalid — 300s (5min). */
const DEFAULT_CONFIRM_WINDOW_SEC = 300;

/**
 * G0 cool-down after the last SubagentStart/SubagentStop seen for this
 * session — {@link DEFAULT_CONFIRM_WINDOW_SEC} by default, overridable via
 * `FUSE_CONFIRM_SUBAGENT_WINDOW_SEC` (seconds) without a rebuild. Read this
 * doc before ever touching this value: it is NOT G0's primary protection,
 * and it is not sized to "safely cover a sub-agent's whole runtime".
 *
 * G0's PRIMARY protection is P0, measured live under Codex in a prior
 * session: a sub-agent never receives its own `UserPromptSubmit` — only a
 * human typing into the top-level session does — so a sub-agent is
 * STRUCTURALLY unable to place a CONFIRM token at all, regardless of this
 * window's value. This timestamp is a SECOND belt, covering only the
 * residual case where that structural property does not hold on some future
 * harness (Kimi: not yet measured either way).
 *
 * The default is a deliberate, owner-decided trade-off between over-refusal
 * and usability, NOT a safety-maximizing constant: sub-agents in this
 * ecosystem share the lead session's `session_id`, and the owner runs
 * sub-agents continuously — an earlier 30-minute window froze CONFIRM for
 * the entire session on every single sub-agent call, which neutralizes the
 * feature it protects (a guard that disables what it guards is not a good
 * guard). 5 minutes comfortably covers the case that actually matters — a
 * sub-agent genuinely in flight at the exact moment a human types a CONFIRM
 * code — without pinning a busy session shut. Do not read this value as "the
 * time G0 needs to be safe" — that safety comes from P0.
 *
 * This deliberately reuses {@link parseEnvInt} (`src/config/env.ts`) rather
 * than `resolveTtlSec`/`FUSE_ENFORCE_TTL_SEC` (`src/config/ttl.ts`): that TTL
 * governs APEX evidence freshness (120s default) — an unrelated concern
 * accidentally coupling the two would make lengthening the research-evidence
 * window also lengthen the confirmation cool-down. `resolveTtlSec` also
 * hardcodes its own fallback (`DEFAULT_TTL_SEC` = 120) regardless of which
 * env key is passed, so it cannot express a 300s default either — this key
 * gets its OWN env var and its OWN default via the same underlying
 * `parseEnvInt` primitive, with no new parsing logic.
 *
 * Mechanically this is still a single monotone "last seen" timestamp, NOT a
 * start/stop pair — a symmetric increment/decrement depth counter was tried
 * and rejected: the harness dispatches ONE real SubagentStart/SubagentStop
 * through MULTIPLE concurrent sibling plugin processes (the repo's own
 * "~11-process multi-plugin fan-out"), all doing UNLOCKED read-modify-write
 * on the same session-state file — a duplicated decrement can walk the
 * counter to 0 while a sub-agent is still running, and G0 would then wrongly
 * OPEN. Two ever-growing `starts`/`stops` counters were also rejected: if the
 * fan-out dispatches SubagentStart via N processes and SubagentStop via
 * M ≠ N, `starts > stops` stays true FOREVER and the session is frozen for
 * good — worse than any window.
 *
 * `Math.max(prevSeenAt, now)` avoids both failure modes: an LWW
 * (last-writer-wins) register merged with `max`, which is idempotent,
 * commutative, and associative — under ANY interleaving of concurrent
 * writers (lost updates included), the stored value converges to the
 * largest `now` any writer supplied, and every writer's `now` is a real
 * wall-clock read taken within milliseconds of the true event, so it can
 * never regress below a timestamp it already held. BOTH SubagentStart and
 * SubagentStop bump the SAME field this way — there is no decrement
 * anywhere in this file, so there is nothing for a duplicated event to
 * desynchronize; the flag falls only once this window elapses with no
 * further sighting.
 * @param env - Env map to resolve the override from (defaults to `process.env`; tests inject a plain object).
 */
function subagentWindowMs(env: Record<string, string | undefined> = process.env): number {
  return parseEnvInt(env[CONFIRM_WINDOW_ENV_KEY], DEFAULT_CONFIRM_WINDOW_SEC) * 1000;
}

/**
 * G0: true within {@link subagentWindowMs} of the last SubagentStart/
 * SubagentStop seen for this session. An invalid/missing session id is
 * treated as active too — fail-closed, never pose a token when in doubt.
 */
export function isSubagentActive(sessionIdRaw: unknown, now: number, home: string = homedir(), env: Record<string, string | undefined> = process.env): boolean {
  const sid = sanitizeSessionId(sessionIdRaw);
  if (!sid) return true;
  const seenAt = loadSessionState(sid, home).subagentSeenAt;
  return typeof seenAt === "number" && now - seenAt < subagentWindowMs(env);
}

/**
 * Record a SubagentStart OR SubagentStop sighting for this session as a
 * monotone max-write (see {@link subagentWindowMs}'s doc for why this can
 * never desync unsafely under concurrent racy writers). Both events call
 * this the SAME way — there is no separate "clear" path.
 *
 * Called unconditionally, BEFORE scope branching, on every SubagentStart/Stop
 * across every plugin (dispatch.ts) — never allowed to throw: a disk fault
 * here (full disk, unwritable home) must degrade to "sighting not recorded",
 * never crash sub-agent lifecycle dispatch for scopes that have nothing to do
 * with CONFIRM. Safe to swallow: G0's PRIMARY protection is P0 (a sub-agent
 * structurally never receives its own UserPromptSubmit, confirm-gate.ts's
 * doc) — this window is only a second belt, so losing one sighting degrades
 * that belt, it does not open the gate.
 */
export function markSubagentSeen(sessionIdRaw: unknown, now: number, home: string = homedir()): void {
  try {
    const sid = sanitizeSessionId(sessionIdRaw);
    if (!sid) return;
    const state = loadSessionState(sid, home);
    const prev = typeof state.subagentSeenAt === "number" ? state.subagentSeenAt : 0;
    saveSessionState(sid, { ...state, subagentSeenAt: Math.max(prev, now) }, home);
  } catch {
    // A state-io failure must never break the hook (same invariant as confirm-submit.ts).
  }
}
