/**
 * Shared low-level parser for a sub-agent's OWN transcript (`agent_transcript_path`
 * — the clean JSONL the Claude Code platform writes per sub-agent, CLI v2.0.42+).
 * Per LESSON.md this is the RELIABLE anchor for evidence: sidechain PostToolUse
 * hooks are not guaranteed (issues #43612/#27655/#34692). One parser, reused by
 * file-attribution (`agent-files.ts`) and retroactive evidence harvesting
 * (`src/freshness/evidence-harvest.ts`) — no duplication.
 */
import { readText } from "../../util/runtime-io";

/** A tool_use content block inside a transcript message. */
interface ToolUseBlock {
  type: string;
  /** Tool name, e.g. "Write", "Edit", "WebSearch", "Grep". */
  name?: string;
  /** Raw tool input — shape varies per tool; narrowed at the call-site. */
  input?: Record<string, unknown>;
}

/** One JSONL line of a Claude Code transcript. */
interface TranscriptLine {
  /** ISO-8601 or epoch-ms timestamp written by the platform (may be absent). */
  timestamp?: string | number;
  message?: { content?: unknown[] };
}

/** A parsed `tool_use`, carrying its message timestamp when the platform stamped one. */
export interface TranscriptToolUse {
  /** Tool name, e.g. "Write", "WebSearch", "Read". */
  name: string;
  /** Raw tool input payload (shape varies per tool). */
  input: Record<string, unknown> | undefined;
  /** Epoch-ms of the enclosing message, or `undefined` when unstamped. */
  ts?: number;
}

/** Parse a raw `timestamp` field to epoch ms; `undefined` when absent or invalid. */
function parseTs(raw: string | number | undefined): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "number") return raw;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * Scan a sub-agent transcript into its ordered `tool_use` blocks (each with the
 * enclosing message timestamp). Distinguishes "no tool use" from "cannot read":
 * returns `null` when the path is absent or the transcript is unreadable (callers
 * fail-open), or a possibly-empty array when parsed. Malformed lines/blocks are
 * tolerated and skipped.
 * @param transcriptPath - Absolute path to the sub-agent's own `.jsonl` transcript.
 * @returns Ordered tool uses, or `null` when unreadable.
 */
export function readAgentToolUses(transcriptPath: string | undefined): TranscriptToolUse[] | null {
  if (!transcriptPath) return null;
  let text: string;
  try {
    text = readText(transcriptPath);
  } catch {
    return null; // fail-open: caller keeps its pre-harvest state
  }
  const out: TranscriptToolUse[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry: TranscriptLine;
    try {
      entry = JSON.parse(line) as TranscriptLine;
    } catch {
      continue; // tolerate malformed lines
    }
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    const ts = parseTs(entry.timestamp);
    for (const block of content as ToolUseBlock[]) {
      if (block?.type !== "tool_use" || !block.name) continue;
      out.push({ name: block.name, input: block.input, ts });
    }
  }
  return out;
}
