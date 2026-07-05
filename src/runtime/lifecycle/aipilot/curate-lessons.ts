/**
 * Stage-0 mechanical, LLM-free dedup of MEMORY/LESSON.md bullets + cap→archive
 * orchestration. Strict-dedup near-identical bullets (keep newest, `[TRIGGERS …]`
 * preserved), then hand the deduped set to lesson-archive's cap split. Returns the
 * rewritten LESSON.md content, the archive block to move out, and a human report.
 * Pure: all file I/O (archive-first, fail-safe) lives in the dispatch caller.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CAP, DAY_MS, STALE_DAYS, TRIG, type Block, citedPaths, jaccard, parse } from "./lesson-parse";
import { formatArchive, splitAtCap } from "./lesson-archive";

const SIM_THRESHOLD = 0.8;
const MIN_TOKENS = 4;

/** Report lines for bullets older than STALE_DAYS whose only cited path is gone. */
function staleReport(blocks: Block[], now: number, root: string): string[] {
  const cutoff = now - STALE_DAYS * DAY_MS;
  return blocks.flatMap((b) => {
    if (!(b.ts <= cutoff)) return [];
    const paths = citedPaths(b.raw.join(" "));
    if (paths.length === 0 || paths.some((p) => existsSync(join(root, p)))) return [];
    return [`[STALE?] ${(b.raw[0] ?? "").slice(0, 90)} — missing path(s): ${paths.join(", ")}`];
  });
}

/** Strict-dedup: keep the newest of each near-identical pair (TRIGGERS carried over). Returns kept blocks + fusion report lines. */
function dedup(blocks: Block[]): { kept: Block[]; fused: string[] } {
  const kept: Block[] = [];
  const fused: string[] = [];
  for (const b of blocks) {
    const hit = b.tokens.size >= MIN_TOKENS ? kept.find((k) => k.tokens.size >= MIN_TOKENS && jaccard(k.tokens, b.tokens) >= SIM_THRESHOLD) : undefined;
    if (!hit) { kept.push(b); continue; }
    const [win, drop] = (b.ts > hit.ts || Number.isNaN(hit.ts)) ? [b, hit] : [hit, b];
    if (win !== hit) kept[kept.indexOf(hit)] = win;
    if (!win.raw.some((l) => TRIG.test(l.trim()))) { const t = drop.raw.find((l) => TRIG.test(l.trim())); if (t) win.raw.push(t); }
    fused.push(`fusion: kept ${(win.raw[0] ?? "").slice(0, 60)} · dropped ${(drop.raw[0] ?? "").slice(0, 60)}`);
  }
  return { kept, fused };
}

/** Result of a curation pass: rewritten LESSON.md, the block to archive out, a report. */
export interface CurateResult { content: string; archive: string; report: string; }

/**
 * Dedup LESSON.md bullets, then archive the oldest excess over CAP (via
 * lesson-archive). `content` is byte-identical to the input when nothing is
 * deduped or archived. The `archive` block (possibly "") is what the caller must
 * PREPEND to LESSON-archive.md, archive-first, before writing `content`.
 * @param content - Raw LESSON.md text.
 * @param now - Clock (ms) for stale/archival windows.
 * @param root - Project root, for resolving cited paths in the stale report.
 * @returns The rewritten content, the archive block, and the report.
 */
export function curateLessons(content: string, now: number, root: string = process.cwd()): CurateResult {
  const { preamble, blocks } = parse(content);
  const { kept, fused } = dedup(blocks);
  const { keep, archive } = splitAtCap(kept, now);
  const changed = fused.length > 0 || archive.length > 0;
  const rebuilt = changed ? `${preamble}\n${keep.map((b) => b.raw.join("\n")).join("\n\n")}\n` : content;
  const capReport = archive.length ? [`${kept.length} bullets (> ${CAP}) — ${archive.length} oldest archived → LESSON-archive.md`] : [];
  const report = [...fused, ...capReport, ...staleReport(blocks, now, root)].join("\n");
  return { content: rebuilt, archive: formatArchive(archive, now), report };
}
