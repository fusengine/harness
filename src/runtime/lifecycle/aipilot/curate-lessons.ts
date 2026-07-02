/**
 * Mechanical, LLM-free curation of `MEMORY/LESSON.md` bullets (anti-obesity):
 * strict-dedup near-identical bullets (keep newest, `[TRIGGERS …]` preserved),
 * flag over-cap + stale (>90d, cited path gone) in a report. Only dedup writes.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const CAP = 50;
const STALE_DAYS = 90;
const SIM_THRESHOLD = 0.8;
const MIN_TOKENS = 4;
const TRIG = /^\[TRIGGERS\s+.+\]$/; // opus-lessons' case-sensitive decision-time tag line

/** A bullet plus any continuation lines (e.g. a `[TRIGGERS …]` line). */
interface Block { raw: string[]; ts: number; tokens: Set<string>; }

/** Epoch ms for a `[YYYY-MM-DD HH:MM]` stamp; `NaN` if absent or out of range. */
function parseTs(line: string): number {
  const m = line.match(/\[(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return NaN;
  const mo = +(m[2] ?? 0), d = +(m[3] ?? 0);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
  return Date.UTC(+(m[1] ?? 0), mo - 1, d, +(m[4] ?? 0), +(m[5] ?? 0));
}

/** Content words (>=4 chars), timestamp & TRIGGERS marker stripped. */
function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/\[triggers[^\]]*\]/g, " ")
      .replace(/\[\d{4}-\d{2}-\d{2}[^\]]*\]/g, " ")
      .replace(/[^a-z0-9àâäéèêëîïôöùûüç/._-]+/gi, " ")
      .split(/\s+/).filter((t) => t.length >= 4),
  );
}

/** Jaccard overlap of two token sets (0 when both empty). */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const inter = [...a].filter((t) => b.has(t)).length;
  return inter / (a.size + b.size - inter);
}
/** Repo-relative cited paths (slash + extension) referenced in a block. */
function citedPaths(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/`([^`]+)`/g)) { if (m[1]) out.add(m[1]); }
  for (const m of text.matchAll(/[\w./@-]+\.\w{1,5}/g)) { if (m[0]) out.add(m[0]); }
  return [...out].filter((p) => p.includes("/") && /\.\w{1,5}$/.test(p));
}

/** Split into a verbatim preamble and one Block per `- ` bullet. */
function parse(content: string): { preamble: string; blocks: Block[] } {
  const lines = content.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length && !/^-\s/.test(lines[i] ?? "")) i++;
  const preamble = lines.slice(0, i).join("\n");
  for (; i < lines.length; i++) {
    const l = lines[i] ?? "", last = blocks[blocks.length - 1];
    if (/^-\s/.test(l)) blocks.push({ raw: [l], ts: parseTs(l), tokens: tokenize(l) });
    else if (l.trim() && last) last.raw.push(l);
  }
  return { preamble, blocks };
}

/** Report lines for bullets older than STALE_DAYS whose only cited path is gone. */
function staleReport(blocks: Block[], now: number, root: string): string[] {
  const cutoff = now - STALE_DAYS * 86400000;
  return blocks.flatMap((b) => {
    if (!(b.ts <= cutoff)) return [];
    const paths = citedPaths(b.raw.join(" "));
    if (paths.length === 0 || paths.some((p) => existsSync(join(root, p)))) return [];
    return [`[STALE?] ${(b.raw[0] ?? "").slice(0, 90)} — chemin(s) disparu(s): ${paths.join(", ")}`];
  });
}

/**
 * Strict-dedup LESSON.md bullets (keep newest, its `[TRIGGERS …]` line preserved —
 * or carried over from the dropped twin if the kept one lacks it) and report
 * cap/stale. `content` unchanged unless a dedup occurred. Returns content + report.
 */
export function curateLessons(content: string, now: number, root: string = process.cwd()): { content: string; report: string } {
  const { preamble, blocks } = parse(content);
  const kept: Block[] = [];
  const fused: string[] = [];
  for (const b of blocks) {
    const hit = b.tokens.size >= MIN_TOKENS ? kept.find((k) => k.tokens.size >= MIN_TOKENS && jaccard(k.tokens, b.tokens) >= SIM_THRESHOLD) : undefined;
    if (!hit) { kept.push(b); continue; }
    const [win, drop] = (b.ts > hit.ts || Number.isNaN(hit.ts)) ? [b, hit] : [hit, b];
    if (win !== hit) kept[kept.indexOf(hit)] = win;
    if (!win.raw.some((l) => TRIG.test(l.trim()))) { const t = drop.raw.find((l) => TRIG.test(l.trim())); if (t) win.raw.push(t); }
    fused.push(`fusion: gardé ${(win.raw[0] ?? "").slice(0, 60)} · retiré ${(drop.raw[0] ?? "").slice(0, 60)}`);
  }
  const old = [...kept].sort((a, b) => a.ts - b.ts).slice(0, Math.max(0, kept.length - CAP));
  const cap = old.length ? [`${kept.length} bullets (> ${CAP}) — plus anciens candidats à l'archivage:`, ...old.map((b) => `  ${(b.raw[0] ?? "").slice(0, 80)}`)] : [];
  const report = [...fused, ...cap, ...staleReport(blocks, now, root)].join("\n");
  const rebuilt = fused.length ? `${preamble}\n${kept.map((b) => b.raw.join("\n")).join("\n\n")}\n` : content;
  return { content: rebuilt, report };
}
