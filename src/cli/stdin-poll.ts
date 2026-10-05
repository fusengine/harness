/**
 * Thread-free idle detection for Bun: `poll(2)` on fd 0 through `bun:ffi`.
 * `poll(fd, timeout)` waits for readability without blocking the thread past the
 * timeout, so the plain synchronous `readSync(0)` only runs when it cannot block
 * (data or EOF is ready). Measured: ~1 ms and ~1.3 MB, versus ~13 MB and
 * 5–14 ms for a worker thread. Falls back (returns `undefined`) off Bun, on
 * Windows, or when libc cannot be opened; the caller then uses the worker.
 */
import { readSync } from "node:fs";
import { STDIN_CHUNK_BYTES, type PullWindow, type StdinPull } from "./stdin-pull";

/** `poll(fd, ms)`: >0 readable (data, EOF or error), 0 timed out, <0 failed/interrupted. */
export type PollFd = (fd: number, ms: number) => number;

const LIBC_CANDIDATES: readonly string[] = process.platform === "darwin"
  ? ["libc.dylib"]
  : ["libc.so.6", "libc.musl-x86_64.so.1", "libc.musl-aarch64.so.1"];

/** Load a `poll` binding via `bun:ffi`; `undefined` when unavailable. */
export async function loadPoll(): Promise<PollFd | undefined> {
  if (!("bun" in process.versions) || process.platform === "win32" || process.env.FUSE_HOOK_STDIN_POLL === "0") return undefined;
  try {
    const spec = "bun:ffi"; // variable specifier: keeps bundlers and Node from resolving it
    const { dlopen, ptr } = await import(spec) as typeof import("bun:ffi");
    for (const lib of LIBC_CANDIDATES) {
      try {
        const { symbols } = dlopen(lib, { poll: { args: ["ptr", "u64", "i32"], returns: "i32" } });
        const events = new Int16Array(4); // struct pollfd { int fd; short events; short revents; }
        const fdSlot = new Int32Array(events.buffer);
        return (fd, ms) => {
          fdSlot[0] = fd;
          events[2] = 1; // POLLIN
          events[3] = 0;
          return symbols.poll(ptr(events), 1, ms);
        };
      } catch { /* try the next libc name */ }
    }
  } catch { /* no bun:ffi */ }
  return undefined;
}

const BACKOFF_MS = 5;
const sleepCell = new Int32Array(new SharedArrayBuffer(4));

/**
 * Puller over `fd` that waits with `poll` before each read: `null` at EOF or when
 * nothing becomes readable within the window of `win` (which also records whether
 * a half-received payload stalled). A failing `poll` backs off 5 ms before retrying.
 */
export function pollPull(fd: number, poll: PollFd, win: PullWindow): StdinPull {
  const buf = Buffer.alloc(STDIN_CHUNK_BYTES);
  return (settle) => {
    const deadline = Date.now() + win.ms(settle);
    for (;;) {
      const left = Math.max(0, deadline - Date.now());
      const ready = poll(fd, left);
      if (ready === 0) { win.expired(settle); return null; }
      if (ready < 0) {
        if (left === 0) { win.expired(settle); return null; }
        Atomics.wait(sleepCell, 0, 0, Math.min(BACKOFF_MS, left)); // EINTR or a failing poll: never spin
        continue;
      }
      const n = readSync(fd, buf, 0, STDIN_CHUNK_BYTES, null);
      if (n === 0) return null;
      return buf.subarray(0, n);
    }
  };
}
