/**
 * @module notices
 * Compact, uniform "compliance" notices for the user-visible `systemMessage`
 * channel — the visual counterpart to the additionalContext-only gate/credit
 * signals, which land in agent-only context and stay invisible to the human in
 * the Claude Code UI (deny reasons show in red; these did not show at all).
 * Owner-reported gap: pass-notices existed in v0.1.49 for design gates, but
 * nothing surfaced skill credits, freshness, or the sniper reminder to the human.
 *
 * The text builders are pure. `refCreditNoticeFor` is the one exception — like
 * `pre-allow.ts` uses the JSON `oncePerWindow`, this one uses the exclusive
 * {@link onceExclusive} mode instead: it fires on the same short burst window
 * as `track-changes.ts`'s sniper reminder, fanned out across every installed
 * plugin's PostToolUse hook for ONE real edit, so the same lost-update race
 * applies (lesson 2026-07-05 16:00). Rendering onto a harness's native stdout
 * always goes through the existing adapter helpers (`respond`/
 * `attachSystemMessage`); a harness with no `systemMessage` channel (e.g.
 * cline) silently drops the notice there (documented no-op, never a crash) —
 * nothing in this module renders directly.
 *
 * CHANNEL CONTRACT — human-only, exactly once: the `userMessage`/`systemMessage`
 * these notices ride is a HUMAN channel by platform contract. It never reaches
 * the agent — `formatPrompt` (src/prompt/types.ts) excludes it — so the emitting
 * sub-agent does NOT see its own notice; only the human owner does, and exactly
 * ONCE even under the multi-plugin fan-out, because the emitter is gated by
 * {@link onceExclusive}. Verified live 2026-07-06: under the real ×11 fan-out a
 * single skill-ref Read surfaced one `✓ SOLID refs read` line in the owner's
 * terminal (not duplicated, and correctly invisible to the agent).
 */
import { onceExclusive } from "./inject-dedup";
import { BURST_DEDUP_MS } from "./burst-window";

/** One compliance line: `✓ <gate> — <detail>` (detail omitted when empty). */
export function complianceNotice(gate: string, detail: string): string {
  return detail ? `✓ ${gate} — ${detail}` : `✓ ${gate}`;
}

/** One non-blocking requirement line: `⚠ <requirement> — <detail>`. */
export function requirementNotice(requirement: string, detail: string): string {
  return detail ? `⚠ ${requirement} — ${detail}` : `⚠ ${requirement}`;
}

/** Extract the skill name from a `.md` ref path (`.../skills/<name>/...`), or null when it isn't a skill reference (a banal doc Read — no notice). */
export function skillNameFromRefPath(path: string): string | null {
  const m = /skills\/([^/]+)\//.exec(path);
  return m?.[1] ?? null;
}

/** Notice for a SOLID/skill reference credited via an in-session Read, or null for a non-skill `.md`. */
export function refCreditedNotice(path: string): string | null {
  const skill = skillNameFromRefPath(path);
  return skill ? complianceNotice("SOLID refs read", skill) : null;
}

/** Notice for the APEX freshness gate (explore+research) currently satisfied. */
export function evidenceFreshNotice(): string {
  return complianceNotice("evidence fresh", "explore+research");
}

/** Notice mirroring the existing sniper-required additionalContext reminder. */
export function sniperRequiredNotice(fileName: string): string {
  return requirementNotice("sniper required", fileName);
}

/**
 * The one `✓ SOLID refs read (<skill>)` notice to show for this PostToolUse
 * call, or null. Scans the activities `activityFor` recorded from this event
 * for a skill-ref Read, deduped per (session, path) against the same burst
 * window as the sniper reminder — the ~11 sibling-plugin fan-out for one real
 * Read must never repeat it (lesson 2026-07-05 15:21).
 * @param activities - This event's recorded activities (only `ref` entries matter).
 * @param sessionId - Current session id (dedup scope).
 * @param now - Event clock.
 * @param dir - State-dir override for the dedup sidecar (tests MUST pass an
 *   isolated dir; production passes the per-project state dir).
 */
export function refCreditNoticeFor(
  activities: ReadonlyArray<{ kind: string; path?: string }>,
  sessionId: string,
  now: number,
  dir?: string,
): string | null {
  for (const a of activities) {
    if (a.kind !== "ref" || !a.path) continue;
    const notice = refCreditedNotice(a.path);
    if (!notice) continue;
    if (!onceExclusive(`ref-credited:${sessionId}:${a.path}`, BURST_DEDUP_MS, { now, dir })) continue;
    return notice;
  }
  return null;
}
