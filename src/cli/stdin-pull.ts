import { readSync } from "node:fs";

/**
 * Chunk puller shared by the legacy (sync) and idle-aware stdin readers.
 * Returns the next chunk, or `null` at EOF / idle expiry. The returned view is
 * only valid until the next call. `settle` is true when a complete top-level
 * JSON object has already been received: the puller may then stop waiting after
 * a short grace instead of the full idle window.
 */
export type StdinPull = (settle: boolean) => Buffer | null;

/** A puller plus whether the reader may stop early on a complete JSON object. */
export interface StdinIo {
  pull: StdinPull;
  early?: boolean;
  /** True when a pull ended because the partial-payload bound expired (the caller fails closed). */
  stalled?: () => boolean;
}

/**
 * Wait windows of an idle-aware puller. While stdin is open and no complete JSON
 * object has arrived (zero bytes or a partial payload alike): `partialMs`, and
 * expiry means the payload stalled (the caller fails closed; EOF never lands here).
 * Complete object: the short `graceMs`. There is deliberately no shorter give-up
 * window: a late first byte must be handled exactly like the host's slow write.
 */
export class PullWindow {
  private stall = false;

  constructor(private readonly graceMs: number, private readonly partialMs: number) {}

  /** Milliseconds to wait for the next chunk. */
  ms(settle: boolean): number {
    return settle ? this.graceMs : this.partialMs;
  }

  /** Record that a wait ended with neither data nor EOF. */
  expired(settle: boolean): void {
    if (!settle) this.stall = true;
  }

  /** Whether the partial-payload bound expired. */
  stalled(): boolean {
    return this.stall;
  }
}

/** Size of one stdin read. */
export const STDIN_CHUNK_BYTES: number = 64 * 1024;

/** Blocking fd reader (legacy shape): `readSync` until it returns 0 bytes (EOF). */
export function syncPull(fd: number): StdinPull {
  const buf = Buffer.alloc(STDIN_CHUNK_BYTES);
  return () => {
    const n = readSync(fd, buf, 0, STDIN_CHUNK_BYTES, null);
    return n === 0 ? null : buf.subarray(0, n);
  };
}

const isWs = (b: number): boolean => b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d;

/** True when the whole received text parses as JSON (same trim+parse as `readStdin`). */
function parsesAsJson(whole: Buffer): boolean {
  try { JSON.parse(whole.toString("utf8").trim()); return true; } catch { return false; }
}

/**
 * Cheap "complete top-level JSON object" detector: only when a chunk's last
 * non-whitespace byte is `}` is the accumulated text parsed. The verdict is
 * sticky: a complete top-level value can never be repaired by more bytes
 * (trailing garbage or a second object only keeps `JSON.parse` failing, exactly
 * as at EOF), so afterwards the reader just drains what is queued and stops.
 */
export class CompletionTracker {
  private settled = false;

  /**
   * Feed the newest chunk; `whole` lazily yields everything received so far.
   * @returns whether the data received so far already contains one complete JSON value.
   */
  update(chunk: Uint8Array, whole: () => Buffer): boolean {
    if (this.settled) return true;
    let last = chunk.length - 1;
    while (last >= 0 && isWs(chunk[last] as number)) last -= 1;
    if (last < 0) return false;
    this.settled = chunk[last] === 0x7d && parsesAsJson(whole());
    return this.settled;
  }
}
