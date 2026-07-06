/**
 * @module post-compact
 * PostCompact handler (core scope): re-inject the reconciliation snapshot plus a
 * one-line reminder that read-state may have been reset by compaction, so the
 * agent re-reads files before editing. Deduped per session/window (compaction can
 * fan out too). Fully fail-open — any error yields "".
 * @packageDocumentation
 */
import { contextResponse } from "../../adapters/claude";
import { oncePerWindow } from "../inject-dedup";
import { defaultStateDir } from "../paths";
import { renderSnapshot } from "./snapshot";

/** Re-inject at most once per 30s per session (compaction fan-out + retries). */
const COMPACT_DEDUP_MS = 30_000;

/** One-line reminder prepended to the re-injected snapshot. */
const REMINDER = "Context was compacted — reread files before editing (read-state may be reset).";

/**
 * Handle PostCompact: emit the reminder + reconciliation snapshot as
 * `additionalContext`, deduped per session. "" on dedup-suppress or any error.
 * @param data - The raw PostCompact payload (`session_id`, `trigger`).
 * @param cwd - Project root.
 * @param moduleUrl - `import.meta.url` of the caller (locates the running package for the version line).
 * @param now - Clock (defaults to `Date.now()`).
 * @returns The native hook stdout, or "".
 */
export function postCompactContext(data: Record<string, unknown>, cwd: string, moduleUrl: string, now: number = Date.now()): string {
  try {
    const sessionId = typeof data.session_id === "string" ? data.session_id : "unknown";
    if (!oncePerWindow(`postcompact:${sessionId}`, COMPACT_DEDUP_MS, { now, dir: defaultStateDir(cwd) })) return "";
    const snapshot = renderSnapshot(cwd, moduleUrl);
    return contextResponse("PostCompact", snapshot ? `${REMINDER}\n\n${snapshot}` : REMINDER);
  } catch {
    return "";
  }
}
