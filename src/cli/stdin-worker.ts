/**
 * Worker-thread stdin source — the Node / no-ffi / Windows fallback of
 * `stdin-source.ts` (loaded lazily: the Bun hot path never pays for
 * `node:worker_threads`, whose worker costs ~13 MB RSS and 5–14 ms).
 *
 * The blocking `readSync(0)` runs in a short-lived worker; the main thread waits
 * with `Atomics.wait(…, timeout)` and drains chunks via `receiveMessageOnPort`.
 */
import { MessageChannel, Worker, receiveMessageOnPort } from "node:worker_threads";
import { CONSUMED, SENT, readerState } from "./stdin-reader-state";
import { STDIN_CHUNK_BYTES, type PullWindow, type StdinIo, type StdinPull } from "./stdin-pull";
import { READER_CODE } from "./stdin-reader-code";

/** Max chunks the reader may run ahead of the consumer (back-pressure). */
const MAX_INFLIGHT = 8;

function decode(message: unknown): Buffer | null {
  if (message === null) { readerState.blocked = false; return null; }
  if (message instanceof ArrayBuffer) return Buffer.from(message);
  readerState.blocked = false;
  const detail = (message as { error?: unknown }).error;
  throw new Error(`stdin read failed: ${typeof detail === "string" ? detail : "unknown error"}`);
}

/**
 * Start the reader worker over `fd`; `undefined` when the runtime cannot start it.
 * @param fd - Descriptor to read (0 in production).
 * @param win - Idle / grace / partial-payload wait windows.
 */
export function openWorkerStdin(fd: number, win: PullWindow): StdinIo | undefined {
  const { port1, port2 } = new MessageChannel();
  const shared = new SharedArrayBuffer(16);
  const state = new Int32Array(shared);
  try {
    const worker = new Worker(READER_CODE, {
      eval: true,
      workerData: { port: port2, ctl: shared, fd, chunk: STDIN_CHUNK_BYTES, maxInflight: MAX_INFLIGHT },
      transferList: [port2],
    });
    worker.unref();
  } catch {
    port1.close();
    return undefined;
  }
  port1.unref();
  readerState.ctl = state;
  readerState.blocked = true;
  const pull: StdinPull = (settle) => {
    if (!readerState.blocked) return null;
    const deadline = Date.now() + win.ms(settle);
    for (;;) {
      const seen = Atomics.load(state, SENT);
      const got = receiveMessageOnPort(port1);
      if (got) {
        Atomics.add(state, CONSUMED, 1);
        Atomics.notify(state, CONSUMED);
        return decode(got.message);
      }
      const left = deadline - Date.now();
      if (left <= 0) { win.expired(settle); return null; }
      Atomics.wait(state, SENT, seen, left);
    }
  };
  return { pull, early: true, stalled: () => win.stalled() };
}
