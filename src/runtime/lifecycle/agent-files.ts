/**
 * Per-agent file attribution for SubagentStop. Parses a sub-agent's OWN
 * transcript (`agent_transcript_path` — the clean JSONL the Claude Code platform
 * writes for that specific sub-agent, added in CLI v2.0.42) to recover the exact
 * set of files it wrote via Write/Edit/MultiEdit/NotebookEdit. This lets the
 * sniper reminder attribute only the files THIS agent touched, instead of every
 * file changed in the whole session (which cross-attributes other teammates'
 * work — the bug this fixes). Per LESSON.md, the SubagentStop transcript is the
 * reliable anchor; sidechain PostToolUse hooks are not (issues #43612/#34692).
 */
import { basename } from "node:path";
import { readText } from "../../util/runtime-io";

/** A tool_use content block inside a transcript message. */
interface ToolUseBlock {
  type: string;
  /** Tool name, e.g. "Write", "Edit", "MultiEdit". */
  name?: string;
  /** Raw tool input — shape varies per tool; narrowed at the call-site. */
  input?: Record<string, unknown>;
}

/** One JSONL line of a Claude Code transcript. */
interface TranscriptLine {
  message?: { content?: unknown[] };
}

/** Tools whose `input.file_path`/`notebook_path` names a file the agent authored. */
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/**
 * Return the distinct list of file paths written by the sub-agent whose own
 * transcript is at `transcriptPath`, by scanning its Write/Edit/MultiEdit/
 * NotebookEdit `tool_use` blocks. Distinguishes "no writes" from "cannot read":
 *
 * - `null` — the path is absent, or the transcript is unreadable. The caller
 *   MUST fall back to the session-wide list (fail-open: never drop the sniper
 *   reminder just because a transcript could not be parsed — no regression vs.
 *   the pre-fix behavior).
 * - `string[]` (possibly empty) — the transcript was read; every write was
 *   collected. An empty array means this agent authored no files, so it should
 *   NOT be told to validate files other agents changed.
 *
 * @param transcriptPath - Absolute path to the sub-agent's own `.jsonl`
 *   transcript (SubagentStop payload field `agent_transcript_path`).
 * @returns Distinct written paths (order-preserving), or `null` when unreadable.
 */
export function filesWrittenByAgent(transcriptPath: string | undefined): string[] | null {
  if (!transcriptPath) return null;
  let text: string;
  try {
    text = readText(transcriptPath);
  } catch {
    return null; // fail-open: caller keeps the full session list
  }
  const out: string[] = [];
  const seen = new Set<string>();
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
    for (const block of content as ToolUseBlock[]) {
      if (block?.type !== "tool_use" || !block.name || !WRITE_TOOLS.has(block.name)) continue;
      const fp = block.input?.file_path ?? block.input?.notebook_path;
      if (typeof fp === "string" && fp && !seen.has(fp)) { seen.add(fp); out.push(fp); }
    }
  }
  return out;
}

/**
 * Filter `sessionFiles` (from unified state `.changes.modifiedFiles`) down to the
 * ones this agent actually wrote. Matches on the exact recorded string first,
 * then tolerantly on `basename` so a relative-vs-absolute path drift between the
 * PostToolUse record and the transcript input never loses an owned file.
 * @param sessionFiles - Session-wide modified files.
 * @param written - Paths the agent wrote (from {@link filesWrittenByAgent}).
 * @returns The subset of `sessionFiles` attributable to this agent.
 */
export function attributeFiles(sessionFiles: readonly string[], written: readonly string[]): string[] {
  const exact = new Set(written);
  const bases = new Set(written.map((f) => basename(f)));
  return sessionFiles.filter((f) => exact.has(f) || bases.has(basename(f)));
}
