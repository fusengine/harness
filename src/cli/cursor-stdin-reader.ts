import { readSync } from "node:fs";
import { CURSOR_SCANNER_LIMITS, CursorEventScanner } from "./cursor-event-scanner";

const HEAD_BYTES = 4096;
const CHUNK_BYTES = 64 * 1024;

export type CursorStdinRead =
  | { kind: "ok"; text: string }
  | { kind: "oversize"; head: string };

/**
 * Requested independent Buffer allocation/retention lengths and scanner cardinalities.
 * Zero-copy aliases such as `subarray`, backing pools/ArrayBuffers, JS objects/strings,
 * and RSS are excluded; this metric is not a physical or total-memory bound.
 */
export function cursorReaderBounds(maxBytes: number): {
  bufferAllocationRequestBytes: number;
  scannerTokenEntries: number;
  scannerFrames: number;
} {
  return {
    bufferAllocationRequestBytes: maxBytes + CHUNK_BYTES + HEAD_BYTES + CURSOR_SCANNER_LIMITS.tokenEntries,
    scannerTokenEntries: CURSOR_SCANNER_LIMITS.tokenEntries,
    scannerFrames: CURSOR_SCANNER_LIMITS.maxDepth,
  };
}

/**
 * Read Cursor stdin through EOF for valid top-level event classification.
 * Cursor's host-configured execution timeout bounds an idle open pipe.
 */
export function readCursorBounded(fd: number, maxBytes: number): CursorStdinRead {
  const chunk = Buffer.alloc(CHUNK_BYTES);
  const head = Buffer.alloc(HEAD_BYTES);
  const retained = Buffer.alloc(maxBytes);
  const scanner = new CursorEventScanner();
  let headLength = 0;
  let retainedLength = 0;
  let total = 0;
  let oversize = false;
  for (;;) {
    const length = readSync(fd, chunk, 0, CHUNK_BYTES, null);
    if (length === 0) break;
    const view = chunk.subarray(0, length);
    scanner.write(view);
    total += length;
    if (headLength < HEAD_BYTES) {
      const copied = Math.min(length, HEAD_BYTES - headLength);
      view.copy(head, headLength, 0, copied);
      headLength += copied;
    }
    if (!oversize) {
      const copied = Math.min(length, Math.max(0, maxBytes - retainedLength));
      if (copied > 0) view.copy(retained, retainedLength, 0, copied);
      retainedLength += copied;
      if (total > maxBytes) oversize = true;
    }
  }
  if (!oversize) return { kind: "ok", text: retained.subarray(0, total).toString("utf8") };
  const event = scanner.finish();
  return {
    kind: "oversize",
    head: event ? JSON.stringify({ hook_event_name: event }) : head.subarray(0, headLength).toString("utf8"),
  };
}
