/** Seeded random transcript generator for the old-vs-new differential (adversarial by design). */

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Windows the differential probes (also used to place boundary timestamps). */
export const WINDOWS: readonly number[] = [1, 60_000, 120_000, 900_000, Number.MAX_SAFE_INTEGER];
const AGENTS = ["explore-codebase", "research-expert", "brainstorming", "fuse-ai-pilot:research-expert", "a:b:explore-codebase", "other"];
const MD = ["/p/a.md", "/p/b.md", "/skills/x/SKILL.md", "rel.md", "/p/é世界.md", "/p/c.txt", "/x/.harness/cache/ab.md"];
const FILL = "héllo 世界 😀 \u{1F9EA} ";

type R = () => number;
const pick = <T>(r: R, a: readonly T[]): T => a[Math.floor(r() * a.length)] as T;

/** A random timestamp field value (ISO / epoch / invalid / null / absent / boundary / future). */
function stamp(r: R, now: number): { has: boolean; v?: unknown } {
  const k = Math.floor(r() * 9);
  const off = k === 0 ? pick(r, WINDOWS.slice(0, 4)) + pick(r, [-1, 0, 1]) : Math.floor(r() * 2_000_000) - 100_000;
  if (k === 1) return { has: false };
  if (k === 2) return { has: true, v: pick(r, ["garbage", "", "2026-13-99"]) };
  if (k === 3) return { has: true, v: null };
  const ms = now - off;
  return { has: true, v: k % 2 ? new Date(ms).toISOString() : ms };
}

/** One random content block. */
function block(r: R): unknown {
  const k = Math.floor(r() * 14);
  if (k === 0) return { type: "tool_use", name: pick(r, ["Task", "Agent", "AgentSwarm"]), input: { subagent_type: pick(r, AGENTS) } };
  if (k === 1) return { type: "tool_use", name: "Task", input: { name: pick(r, AGENTS) } };
  if (k === 2) return { type: "tool_use", name: "Task", input: { subagent_type: 7 } };
  if (k === 3) return { type: "tool_use", name: pick(r, ["Glob", "Grep", "WebSearch", "mcp__context7__query-docs"]), input: {} };
  if (k === 4) return { type: "tool_use", name: "Bash", input: { command: pick(r, ["ls -la", "FOO=1 rg x", "echo hi", "cat a"]) } };
  if (k < 8) return { type: "tool_use", name: "Read", input: r() < 0.7 ? { file_path: pick(r, MD) } : { path: pick(r, MD) } };
  if (k === 8) return null;
  if (k === 9) return { type: "text", text: 'a "tool_use" mention' };
  if (k === 10) return { type: "tool_result", content: [{ type: "text", text: '{"type":"tool_use","name":"Task","input":{"subagent_type":"research-expert"}}' }] };
  if (k === 11) return { type: "tool_use", input: { subagent_type: "explore-codebase" } };
  if (k === 12) return { type: "tool_use", name: 5, input: null };
  return { type: "tool_use", name: "Read", input: { file_path: 5 } };
}

/** One random JSONL line (no terminator). */
function line(r: R, now: number): string {
  const k = Math.floor(r() * 12);
  if (k === 0) return '{"timestamp":"x","message":{"content":[{"type":"tool_use"';
  if (k === 1) return pick(r, ["", "   ", "\t"]);
  if (k === 3) {
    // Escaped-form lines: type / names spelled with \uXXXX (no literal "tool_use" bytes).
    const esc = (s: string): string => s.replace(/./g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
    const ty = r() < 0.5 ? esc("tool_use") : "tool\\u005fuse";
    const nm = pick(r, ["Task", "Read", "Glob"]);
    const inp = nm === "Task" ? `{"subagent_type":"${esc(pick(r, AGENTS))}"}` : `{"file_path":"${esc(pick(r, MD))}"}`;
    const ts = r() < 0.5 ? "" : `"timestamp":${now - Math.floor(r() * 2_000_000)},`;
    return `{${ts}"message":{"content":[{"type":"${ty}","name":"${r() < 0.5 ? esc(nm) : nm}","input":${inp}}]}}`;
  }
  if (k === 2) return JSON.stringify({ note: '"tool_use"', timestamp: now, message: { content: "tool_use" } });
  const o: Record<string, unknown> = { type: "assistant", pad: FILL.repeat(Math.floor(r() * 40)) };
  const s = stamp(r, now);
  if (s.has) o.timestamp = s.v;
  o.message = { content: Array.from({ length: Math.floor(r() * 4) }, () => block(r)) };
  return JSON.stringify(o);
}

/** A whole random transcript: mixed line endings, optional missing final newline. */
export function genTranscript(r: R, now: number): string {
  const n = Math.floor(r() * 40);
  const eol = r() < 0.2 ? "\r\n" : "\n";
  let out = Array.from({ length: n }, () => line(r, now)).join(eol);
  if (n > 0 && r() < 0.8) out += eol;
  return out;
}
