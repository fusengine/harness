/**
 * Platform-authored transcript evidence for APEX agent freshness. Reads the
 * Claude Code session JSONL transcript through the memory-bounded incremental
 * index ({@link loadTranscriptIndex}) for genuine dispatch tool_use entries
 * — forging requires writing into the platform-controlled transcript file.
 */
import { loadTranscriptIndex } from "./transcript-index";

/**
 * Return `true` ONLY when, for EVERY name in `names`, the transcript at
 * `transcriptPath` shows a within-window genuine `tool_use`: a dispatch tool
 * ({@link isAgentTool}) whose `subagent_type`/`name` (plugin prefix stripped)
 * matches, OR a direct exploration/research call classified into that name by
 * {@link classifyExplore} — issued by any sub-agent or the lead (the transcript
 * carries no author field). Entries without `timestamp` count as within-window
 * (format-evolution leniency; tamper-resistance comes from platform authoring).
 * The file is never loaded whole: it is streamed in chunks and, given `stateDir`,
 * only the bytes appended since the previous hook are read.
 * @param transcriptPath - Session `.jsonl` transcript (`transcript_path`); false when undefined.
 * @param names - Required agent `subagent_type` values — ALL must appear.
 * @param windowMs - Freshness window in milliseconds.
 * @param now - Current epoch ms (pass `Date.now()` at the call-site).
 * @param stateDir - Per-session state dir holding the incremental index sidecar (optional).
 * @returns `true` when ALL agents have real, within-window transcript evidence.
 */
export function agentsRanFromTranscript(
  transcriptPath: string | undefined,
  names: readonly string[],
  windowMs: number,
  now: number,
  stateDir?: string,
): boolean {
  if (!transcriptPath || names.length === 0) return false;
  const index = loadTranscriptIndex(transcriptPath, stateDir);
  if (!index) return false;
  const cutoff = now - windowMs;
  return names.every((n) => {
    const s = index.agents.get(n);
    return s !== undefined && (s.u === true || (s.ts !== undefined && s.ts > cutoff));
  });
}
