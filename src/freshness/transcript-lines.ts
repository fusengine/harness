/**
 * Bounded-memory forward line scanner for large append-only JSONL host files
 * (Claude transcripts). Reads fixed-size chunks and hands out whole lines as
 * raw bytes, so a multibyte UTF-8 sequence straddling a chunk boundary is never
 * decoded half-way (the `\n` byte 0x0A never occurs inside a multibyte sequence).
 */
import { readSync } from "node:fs";

/** Bytes read per `readSync` (peak transient memory is ~one chunk + the longest line). */
export const CHUNK_BYTES: number = 4 * 1024 * 1024;

/** Result of {@link scanLines}. */
export interface ScanResult {
  /** Byte offset just after the last `\n` consumed (safe resume point). */
  cursor: number;
  /** Unterminated bytes after `cursor` up to `to` (a partial or final line), or `null`. */
  rest: Buffer | null;
}

/**
 * Feed every `\n`-terminated line in `[from, to)` of an open fd to `onLine`
 * (line bytes WITHOUT the `\n`; a trailing `\r` is left in place).
 * @param fd - Open read-only file descriptor.
 * @param from - Start byte offset (must be a line start).
 * @param to - Exclusive end byte offset (a `statSync` size snapshot).
 * @param onLine - Receives each complete line; the buffer is only valid during the call.
 * @param chunkBytes - Chunk size override (tests exercise tiny chunks).
 * @returns The resume cursor and the unterminated remainder.
 */
export function scanLines(
  fd: number,
  from: number,
  to: number,
  onLine: (line: Buffer) => void,
  chunkBytes: number = CHUNK_BYTES,
): ScanResult {
  const chunk = Buffer.allocUnsafe(Math.max(1, Math.min(chunkBytes, to - from)));
  let pos = from;
  let cursor = from;
  let carry: Buffer | null = null;
  while (pos < to) {
    const n = readSync(fd, chunk, 0, Math.min(chunk.length, to - pos), pos);
    if (n <= 0) break;
    const view = chunk.subarray(0, n);
    let start = 0;
    for (let nl = view.indexOf(10, start); nl !== -1; nl = view.indexOf(10, start)) {
      const seg = view.subarray(start, nl);
      onLine(carry ? Buffer.concat([carry, seg]) : seg);
      carry = null;
      start = nl + 1;
      cursor = pos + nl + 1;
    }
    if (start < n) {
      const tail = view.subarray(start, n);
      carry = carry ? Buffer.concat([carry, tail]) : Buffer.from(tail);
    }
    pos += n;
  }
  return { cursor, rest: carry };
}
