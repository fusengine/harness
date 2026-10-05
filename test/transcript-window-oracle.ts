/**
 * ORACLE for the transcript-index differential: the pre-optimization
 * implementations, copied verbatim from HEAD (whole-file read + split + parse).
 * Never edit these to make a differential pass — the new code must match them.
 */
import { readText } from "../src/util/runtime-io";
import { classifyExplore } from "../src/freshness/explore-tools";
import { isAgentTool } from "../src/runtime/is-agent-tool";
import { recordRefRead, type SessionTrack } from "../src/tracking/session-state";

interface Line { timestamp?: string | number; message?: { content?: unknown[] } }
interface Block { type: string; name?: string; input?: Record<string, unknown> }
interface Use { name: string; input: Record<string, unknown> | undefined; ts?: number }

function parseTs(raw: string | number | undefined): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "number") return raw;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : undefined;
}

/** HEAD `agentsRanFromTranscript`. */
export function oldAgentsRan(path: string | undefined, names: readonly string[], windowMs: number, now: number): boolean {
  if (!path || names.length === 0) return false;
  let text: string;
  try { text = readText(path); } catch { return false; }
  const cutoff = now - windowMs;
  const found = new Set<string>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry: Line;
    try { entry = JSON.parse(line) as Line; } catch { continue; }
    const ts = parseTs(entry.timestamp);
    if (ts !== undefined && ts <= cutoff) continue;
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content as Block[]) {
      if (block?.type !== "tool_use") continue;
      if (block.name !== undefined && isAgentTool(block.name)) {
        const raw = block.input?.subagent_type ?? block.input?.name;
        const agent = typeof raw === "string" ? raw.split(":").pop() ?? raw : undefined;
        if (agent !== undefined && (names as string[]).includes(agent)) found.add(agent);
        continue;
      }
      const hit = classifyExplore(block.name ?? "", block.input);
      if (hit && (names as string[]).includes(hit.phase)) found.add(hit.phase);
    }
    if (found.size === names.length) return true;
  }
  return names.every((n) => found.has(n));
}

/** HEAD `readAgentToolUses`. */
function oldUses(path: string | undefined): Use[] | null {
  if (!path) return null;
  let text: string;
  try { text = readText(path); } catch { return null; }
  const out: Use[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry: Line;
    try { entry = JSON.parse(line) as Line; } catch { continue; }
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    const ts = parseTs(entry.timestamp);
    for (const block of content as Block[]) {
      if (block?.type !== "tool_use" || !block.name) continue;
      out.push({ name: block.name, input: block.input, ts });
    }
  }
  return out;
}

/** HEAD `reconcileRefReadsFromTranscript`. */
export function oldReconcile(track: SessionTrack, path: string | undefined, now: number): SessionTrack {
  const uses = oldUses(path);
  if (!uses) return track;
  let next = track;
  for (const u of uses) {
    if (u.name !== "Read") continue;
    const p = String(u.input?.file_path ?? u.input?.path ?? "");
    if (!p.endsWith(".md")) continue;
    const ts = u.ts ?? now;
    const prev = next.refsReadAt?.[p];
    if (prev === undefined || prev < ts) next = recordRefRead(next, p, ts);
  }
  return next;
}
