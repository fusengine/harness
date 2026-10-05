/**
 * Per-line folding of a Claude transcript into an order-independent evidence
 * index. Each key keeps ONLY the latest stamped time (plus an "unstamped" flag),
 * which is all {@link agentsRanFromTranscript} (window test) and
 * {@link reconcileRefReadsFromTranscript} (max stamp) ever need — so the verdict
 * is exact for any timestamp ordering, with no windowing assumption.
 */
import { isAgentTool } from "../runtime/is-agent-tool";
import { parseTs } from "../runtime/lifecycle/agent-transcript";
import { classifyExplore } from "./explore-tools";

/** Latest evidence for one key: newest stamped time and/or "seen without a stamp". */
export interface Stamp {
  /** Max stamped epoch-ms seen (absent when every sighting was unstamped). */
  ts?: number;
  /** True when at least one sighting carried no (valid) timestamp. */
  u?: true;
}

/** Order-independent evidence index of one transcript. */
export interface TranscriptIndex {
  /** Dispatched agent names (plugin prefix stripped) and explore phases → stamp. */
  agents: Map<string, Stamp>;
  /** `.md` files Read → stamp. */
  refs: Map<string, Stamp>;
}

/** Cheap raw-bytes prefilter: a line without this can hold no tool_use block. */
const TOOL_USE_NEEDLE: Buffer = Buffer.from('"tool_use"');

/** Raw `\u` escape marker — the only JSON syntax that can encode `tool_use` indirectly. */
const UNICODE_ESCAPE: Buffer = Buffer.from("\\u");

/** Create an empty index. */
export function emptyIndex(): TranscriptIndex {
  return { agents: new Map(), refs: new Map() };
}

/** Deep-copy an index (the unterminated tail is folded into a copy, never persisted). */
export function cloneIndex(idx: TranscriptIndex): TranscriptIndex {
  const copy = (m: Map<string, Stamp>): Map<string, Stamp> => new Map([...m].map(([k, v]) => [k, { ...v }]));
  return { agents: copy(idx.agents), refs: copy(idx.refs) };
}

/** Fold one sighting (`ts` undefined = unstamped) into `map[key]`. */
function note(map: Map<string, Stamp>, key: string, ts: number | undefined): void {
  const cur = map.get(key) ?? {};
  if (ts === undefined) cur.u = true;
  else if (cur.ts === undefined || ts > cur.ts) cur.ts = ts;
  map.set(key, cur);
}

/** Raw shape of one JSONL transcript line (only the fields we read). */
interface Line {
  timestamp?: string | number;
  message?: { content?: unknown[] };
}

/** A tool_use content block. */
interface Block {
  type: string;
  name?: string;
  input?: Record<string, unknown>;
}

/**
 * Fold one whole transcript line (bytes without `\n`) into `idx`. Mirrors the
 * pre-index parsers exactly: malformed lines/blocks are skipped, a dispatch tool
 * credits its `subagent_type`/`name`, any other tool_use is classified by
 * {@link classifyExplore}, and `.md` `Read`s are keyed by path.
 */
export function foldLine(idx: TranscriptIndex, bytes: Buffer): void {
  // Lossless prefilter: in JSON only a `\uXXXX` escape can spell letters/`_`, so a line with
  // neither the literal `"tool_use"` nor a `\u` cannot decode to a tool_use block.
  if (!bytes.includes(TOOL_USE_NEEDLE) && !bytes.includes(UNICODE_ESCAPE)) return;
  const text = bytes.toString("utf8");
  if (!text.trim()) return;
  let entry: Line;
  try {
    entry = JSON.parse(text) as Line;
  } catch {
    return;
  }
  const content = entry.message?.content;
  if (!Array.isArray(content)) return;
  const ts = parseTs(entry.timestamp);
  for (const block of content as Block[]) {
    if (block?.type !== "tool_use") continue;
    if (block.name !== undefined && isAgentTool(block.name)) {
      const raw = block.input?.subagent_type ?? block.input?.name;
      if (typeof raw === "string") note(idx.agents, raw.split(":").pop() ?? raw, ts);
    } else {
      const hit = classifyExplore(block.name ?? "", block.input);
      if (hit) note(idx.agents, hit.phase, ts);
    }
    if (block.name !== "Read") continue;
    const path = String(block.input?.file_path ?? block.input?.path ?? "");
    if (path.endsWith(".md")) note(idx.refs, path, ts);
  }
}
