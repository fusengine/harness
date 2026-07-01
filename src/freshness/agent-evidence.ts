/**
 * Platform-authored transcript evidence for APEX agent freshness.
 * Parses the Claude Code session JSONL transcript to find genuine `Task`/`Agent`
 * tool_use entries — forging this requires writing into the transcript file
 * which the Claude Code platform controls, unlike the self-recorded track.
 */
import { readText } from "../util/runtime-io";
import { classifyExplore } from "./explore-tools";

/** Raw shape of one JSONL line in a Claude Code transcript. */
interface TranscriptLine {
  /** ISO-8601 or epoch-ms timestamp written by the platform. */
  timestamp?: string | number;
  message?: { content?: unknown[] };
}

/** A tool_use content block inside a transcript message. */
interface ToolUseBlock {
  type: string;
  /** Tool name, e.g. "Task", "Read", "Edit", "Glob", "Grep", "mcp__context7__query-docs". */
  name?: string;
  /** Raw tool input — shape varies per tool; narrowed at each call-site. */
  input?: Record<string, unknown>;
}

/** Parse a raw `timestamp` field to epoch ms; `undefined` when absent or invalid. */
function parseTs(raw: string | number | undefined): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "number") return raw;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * Return `true` ONLY when, for EVERY name in `names`, the Claude Code
 * transcript at `transcriptPath` contains a genuine `tool_use` of the `Task`/
 * `Agent` tool whose `subagent_type` (or `name`) matches — after stripping any
 * plugin prefix — OR a direct exploration/research tool_use (Glob/Grep, an
 * explore Bash command, mcp__context7/mcp__exa, WebSearch/WebFetch) classified
 * via {@link classifyExplore} into that name, issued by ANY sub-agent or the
 * lead within this same transcript — with the entry timestamp within
 * `windowMs` of `now`.
 *
 * **Timestamp note:** when a transcript entry carries no `timestamp` field it
 * is counted as within-window (we cannot prove staleness). This is
 * intentionally lenient to stay robust across transcript-format evolution; the
 * tamper-resistance guarantee derives from the platform authoring the file —
 * not from the timestamp alone.
 *
 * @param transcriptPath - Absolute path to the session `.jsonl` transcript
 *   (hook payload field: `transcript_path`). Returns `false` when `undefined`.
 * @param names - Required agent `subagent_type` values — ALL must appear.
 * @param windowMs - Freshness window in milliseconds.
 * @param now - Current epoch ms (pass `Date.now()` at the call-site).
 * @returns `true` when ALL agents have real, within-window transcript evidence.
 */
export function agentsRanFromTranscript(
  transcriptPath: string | undefined,
  names: readonly string[],
  windowMs: number,
  now: number,
): boolean {
  if (!transcriptPath || names.length === 0) return false;
  let text: string;
  try {
    text = readText(transcriptPath);
  } catch {
    return false;
  }
  const cutoff = now - windowMs;
  const found = new Set<string>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry: TranscriptLine;
    try {
      entry = JSON.parse(line) as TranscriptLine;
    } catch {
      continue; // tolerate malformed lines
    }
    const ts = parseTs(entry.timestamp);
    if (ts !== undefined && ts <= cutoff) continue;
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content as ToolUseBlock[]) {
      if (block?.type !== "tool_use") continue;
      if (block.name === "Task" || block.name === "Agent") {
        const raw = block.input?.subagent_type ?? block.input?.name;
        // Strip any plugin prefix (`fuse-ai-pilot:research-expert` → `research-expert`)
        // before matching the bare REQUIRED_AGENTS names.
        const agent = typeof raw === "string" ? raw.split(":").pop() ?? raw : undefined;
        if (agent !== undefined && (names as string[]).includes(agent)) found.add(agent);
        continue;
      }
      // Direct exploration/research tool_use — credited to the matching phase
      // regardless of which sub-agent (or the lead) issued it: the transcript
      // carries no author field distinguishing sidechains, so — mirroring the
      // pre-existing self-recorded-track behavior in `runtime/activity.ts` —
      // ANY Glob/Grep/mcp__context7/mcp__exa/WebSearch/WebFetch/explore-Bash
      // tool_use in this session's transcript counts as freshness evidence.
      const hit = classifyExplore(block.name ?? "", block.input);
      if (hit && (names as string[]).includes(hit.phase)) found.add(hit.phase);
    }
    if (found.size === names.length) return true;
  }
  return names.every((n) => found.has(n));
}
