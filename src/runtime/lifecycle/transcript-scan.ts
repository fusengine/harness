/**
 * Bounded-memory JSONL entry iterator for host transcripts (a sub-agent's
 * `agent_transcript_path` can reach tens of MB). Replaces the former
 * `readText` + `split("\n")` + `JSON.parse`-every-line pattern, which held the
 * whole file as a string plus one string per line plus every parsed object
 * (~750 MB peak per hook on a 44 MB transcript). Lines are streamed in fixed
 * chunks ({@link scanLines}) and only lines that can match are parsed.
 *
 * Equivalence with the old pattern: `\n` never occurs inside a UTF-8 multibyte
 * sequence, so per-line decoding equals whole-file decoding; blank lines and
 * malformed JSON are skipped exactly as before. The raw-bytes prefilter is
 * LOSSLESS: a line is skipped only if it contains none of `wanted` AND no `\u`
 * escape (the only JSON syntax that can spell a needle indirectly).
 */
import { closeSync, fstatSync, openSync, readFileSync } from "node:fs";
import { scanLines } from "../../freshness/transcript-lines";

/** Raw `\u` escape marker — keeps the prefilter lossless for escaped keys/values. */
const UNICODE_ESCAPE: Buffer = Buffer.from("\\u");

/**
 * Pre-encode raw-byte needles once per call site.
 * @param words - Literal byte sequences a matching line must contain (e.g. `"tool_use"`).
 * @returns The encoded needles.
 */
export function needles(...words: string[]): Buffer[] {
  return words.map((w) => Buffer.from(w));
}

function mayMatch(line: Buffer, wanted: readonly Buffer[]): boolean {
  if (wanted.length === 0 || line.includes(UNICODE_ESCAPE)) return true;
  return wanted.some((n) => line.includes(n));
}

function parseLine(line: Buffer, onEntry: (entry: unknown) => void): void {
  const text = line.toString("utf8");
  if (!text.trim()) return;
  let entry: unknown;
  try {
    entry = JSON.parse(text);
  } catch {
    return; // tolerate malformed lines, as before
  }
  onEntry(entry);
}

/**
 * Stream every JSONL entry of `path` that may contain one of `wanted` to
 * `onEntry`, in file order. Throws when the file cannot be opened (same as the
 * former `readText`), so each caller keeps its own fail-open policy.
 * @param path - Absolute transcript path.
 * @param wanted - Raw-byte needles (see {@link needles}); empty = every line.
 * @param onEntry - Receives each parsed entry.
 */
export function forEachJsonlEntry(path: string, wanted: readonly Buffer[], onEntry: (entry: unknown) => void): void {
  const fd = openSync(path, "r");
  try {
    const handle = (line: Buffer): void => {
      if (mayMatch(line, wanted)) parseLine(line, onEntry);
    };
    const st = fstatSync(fd);
    if (!st.isFile()) {
      // Pipe / FIFO / device: positional reads fail (ESPIPE) — keep the former whole-read behaviour.
      for (const line of readFileSync(fd).toString("utf8").split("\n")) handle(Buffer.from(line));
      return;
    }
    const { rest } = scanLines(fd, 0, st.size, handle);
    if (rest) handle(rest); // final line without a trailing "\n"
  } finally {
    closeSync(fd);
  }
}
