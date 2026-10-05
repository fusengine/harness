import { CURSOR_SCANNER_LIMITS, CursorEventScanner } from "./cursor-event-scanner";
import { CompletionTracker, STDIN_CHUNK_BYTES, syncPull, type StdinIo } from "./stdin-pull";

const HEAD_BYTES = 4096;

/** Result of the Cursor bounded read; `stalled` marks an oversize-style fail-closed on a never-completed payload. */
export type CursorStdinRead =
  | { kind: "ok"; text: string }
  | { kind: "oversize"; head: string; stalled?: boolean };

/**
 * Sizes (bytes) of the successive `retained` Buffers when the payload reaches
 * `maxBytes`: first `min(maxBytes, chunk)`, then doubling, the last capped at
 * `maxBytes`. The reader allocates exactly this sequence (each growth copies the
 * old buffer into the new one), so the cumulative request is their sum.
 */
function retainedSchedule(maxBytes: number): number[] {
  const sizes = [Math.min(maxBytes, STDIN_CHUNK_BYTES)];
  for (let last = sizes[0] as number; last < maxBytes; last = sizes[sizes.length - 1] as number) {
    sizes.push(Math.min(maxBytes, last * 2));
  }
  return sizes;
}

/**
 * Worst-case (payload reaches the cap) cumulative requested independent Buffer
 * allocation lengths and scanner cardinalities: the grow-on-demand `retained`
 * sequence (see {@link retainedSchedule}), one read chunk, the head probe and the
 * scanner token entries. Zero-copy aliases such as `subarray`, backing
 * pools/ArrayBuffers, JS objects/strings, and RSS are excluded; this metric is
 * neither a physical nor a total-memory bound (a growth briefly holds the old and
 * the new retained buffer together).
 */
export function cursorReaderBounds(maxBytes: number): {
  bufferAllocationRequestBytes: number;
  scannerTokenEntries: number;
  scannerFrames: number;
} {
  const retained = retainedSchedule(maxBytes).reduce((sum, size) => sum + size, 0);
  return {
    bufferAllocationRequestBytes: retained + STDIN_CHUNK_BYTES + HEAD_BYTES + CURSOR_SCANNER_LIMITS.tokenEntries,
    scannerTokenEntries: CURSOR_SCANNER_LIMITS.tokenEntries,
    scannerFrames: CURSOR_SCANNER_LIMITS.maxDepth,
  };
}

/**
 * Read Cursor stdin through EOF for valid top-level event classification.
 * With an idle-aware `io` an oversize-free payload also ends on a complete JSON
 * object (after the settle grace) or on idle expiry, exactly like the EOF it
 * replaces; oversize input is still scanned to EOF/idle for classification.
 * @param fd - Descriptor to read (0 in production).
 * @param maxBytes - Cap from `resolveCursorStdinMaxBytes`.
 * @param io - Chunk source; defaults to the blocking read-to-EOF of `fd`.
 */
export function readCursorBounded(fd: number, maxBytes: number, io: StdinIo = { pull: syncPull(fd) }): CursorStdinRead {
  const head = Buffer.alloc(HEAD_BYTES);
  // grown on demand (doubling, capped at maxBytes): a 16 MiB up-front allocation made Cursor RSS flip 38 -> 54 MB
  let retained = Buffer.alloc(retainedSchedule(maxBytes)[0] as number);
  const scanner = new CursorEventScanner();
  const done = io.early ? new CompletionTracker() : undefined;
  let headLength = 0;
  let retainedLength = 0;
  let total = 0;
  let oversize = false;
  let settle = false;
  for (;;) {
    const view = io.pull(settle);
    if (!view) break;
    const length = view.length;
    scanner.write(view);
    total += length;
    if (headLength < HEAD_BYTES) {
      const copied = Math.min(length, HEAD_BYTES - headLength);
      view.copy(head, headLength, 0, copied);
      headLength += copied;
    }
    if (!oversize) {
      const copied = Math.min(length, Math.max(0, maxBytes - retainedLength));
      if (copied > 0) {
        if (retainedLength + copied > retained.length) {
          const grown = Buffer.alloc(Math.min(maxBytes, Math.max(retainedLength + copied, retained.length * 2)));
          retained.copy(grown, 0, 0, retainedLength);
          retained = grown;
        }
        view.copy(retained, retainedLength, 0, copied);
      }
      retainedLength += copied;
      if (total > maxBytes) oversize = true;
    }
    if (done) settle = !oversize && done.update(view, () => retained.subarray(0, total));
  }
  if (!oversize && io.stalled?.()) return { kind: "oversize", head: head.subarray(0, headLength).toString("utf8"), stalled: true };
  if (!oversize) return { kind: "ok", text: retained.subarray(0, total).toString("utf8") };
  const event = scanner.finish();
  return {
    kind: "oversize",
    head: event ? JSON.stringify({ hook_event_name: event }) : head.subarray(0, headLength).toString("utf8"),
  };
}
