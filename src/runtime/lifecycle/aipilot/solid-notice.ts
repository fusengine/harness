/**
 * SubagentStop SOLID-notice dedup (anti-loop): `checkSolidFromTranscript` is
 * stateless, so an unchanged violation set re-emitted the same
 * `additionalContext` on EVERY SubagentStop — re-invoking the agent in an
 * observed ~15-repeat loop. The dedup fingerprint is a SHA-256 hash of the
 * sorted `file:message` set, persisted per agent key in the canonical
 * `.harness/track/solid-notice.json` sidecar (`config/layout.ts`), written
 * under the synchronous track lock (this hook runs in an ephemeral sync
 * process). Semantics: identical fingerprint within the TTL → silence;
 * changed/absent/expired fingerprint → emit once and record (the TTL derives
 * from `FUSE_ENFORCE_TTL_SEC`, no new env var). On lock contention the notice
 * is emitted anyway (visibility beats a muted violation) but not recorded.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { atomicWrite } from "../../../util/json-io";
import { LOCK_FAILED, withTrackLockSync } from "../../../tracking/track-lock-sync";

/** SHA-256 (truncated) of the sorted violation set — the dedup fingerprint. */
export function noticeFingerprint(violations: string[]): string {
  return createHash("sha256").update([...violations].sort().join("\n")).digest("hex").slice(0, 16);
}

/** Sidecar shape: agent key → last emitted fingerprint + timestamp. */
type NoticeState = Record<string, { hash: string; at: number }>;

/**
 * Decide whether the notice for `key` may be emitted, recording it when so.
 * @param noticeFile - `projectLayout(cwd).solidNoticeFile`.
 * @param key - Agent/transcript identity (e.g. `agent_transcript_path`).
 * @param hash - The current set's fingerprint ({@link noticeFingerprint}).
 * @param now - Clock (epoch ms).
 * @param ttlMs - Reminder window (derived from `FUSE_ENFORCE_TTL_SEC`).
 */
export function shouldEmitNotice(noticeFile: string, key: string, hash: string, now: number, ttlMs: number): boolean {
  let state: NoticeState = {};
  try { state = JSON.parse(readFileSync(noticeFile, "utf8")) as NoticeState; } catch { /* absent/corrupt → emit */ }
  const prev = state[key];
  if (prev && prev.hash === hash && now - prev.at < ttlMs) return false;
  const next: NoticeState = { ...state, [key]: { hash, at: now } };
  const ran = withTrackLockSync(dirname(noticeFile), () => {
    try { atomicWrite(noticeFile, JSON.stringify(next)); } catch { /* fail-open */ }
  });
  void (ran === LOCK_FAILED); // emit regardless (see module doc)
  return true;
}
