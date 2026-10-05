/**
 * Idle-aware stdin source for `harness hook`.
 *
 * A blocked `readSync(0)` freezes the event loop, so no timer can fire while the
 * main thread reads. Two ways around that, both keeping the read a synchronous
 * fd-0 `readSync` (never the async `process.stdin` machinery, see `runtime-io.ts`
 * / oven-sh/bun#25320):
 *  1. Bun (hot path): `poll(2)` through `bun:ffi` gates every read, no thread
 *     (`stdin-poll.ts`, ~1 ms / ~1.3 MB).
 *  2. Otherwise (Node, Windows, no libc): the read runs in a short-lived worker
 *     thread (`stdin-worker.ts`, loaded lazily, ~13 MB / 5–14 ms).
 *
 * Node joins worker threads at exit, so a worker parked inside a blocking
 * `read(2)` would hang `process.exit`; {@link exitHook} handles that case.
 */
import { fstatSync } from "node:fs";
import { resolveStdinGraceMs, resolveStdinPartialMs } from "./stdin-idle-config";
import { PullWindow, type StdinIo } from "./stdin-pull";
import { loadPoll, pollPull } from "./stdin-poll";
import { CONSUMED, READING, STOP, readerState } from "./stdin-reader-state";

/** True while the stdin reader worker may still be blocked inside `read(2)`. */
export function stdinReaderBlocked(): boolean {
  return readerState.blocked;
}

/** Ask the reader worker to leave its loop (a worker parked inside a blocking `read(2)` cannot). */
export function stopStdinReader(): void {
  const ctl = readerState.ctl;
  if (!ctl) return;
  Atomics.store(ctl, STOP, 1);
  Atomics.notify(ctl, STOP);
  Atomics.notify(ctl, CONSUMED);
}

function isRegularFile(fd: number): boolean {
  try { return fstatSync(fd).isFile(); } catch { return false; }
}

/**
 * Return an idle-aware {@link StdinIo}, or `undefined` when the legacy blocking
 * read is the right (or only) choice: regular-file stdin (never blocks) or a
 * runtime that can start neither the poll gate nor the worker.
 * @param fd - Descriptor to read (0 in production).
 * @param env - Environment carrying the idle/grace overrides.
 */
export async function openIdleAwareStdin(fd: number = 0, env: Record<string, string | undefined> = process.env): Promise<StdinIo | undefined> {
  if (isRegularFile(fd)) return undefined;
  const win = new PullWindow(resolveStdinGraceMs(env), resolveStdinPartialMs(env));
  const poll = await loadPoll();
  if (poll) return { pull: pollPull(fd, poll, win), early: true, stalled: () => win.stalled() };
  const { openWorkerStdin } = await import("./stdin-worker");
  return openWorkerStdin(fd, win);
}

/** True when the reader is parked (or about to park) inside a blocking `read(2)`: it cannot be joined. */
function readerParkedInSyscall(): boolean {
  const ctl = readerState.ctl;
  if (!ctl || !readerState.blocked) return false;
  stopStdinReader();
  Atomics.wait(ctl, READING, 1, 25); // a polling reader (EAGAIN) leaves read(2) at once
  return Atomics.load(ctl, READING) === 1;
}

/**
 * Exit the hook process. Normally `process.exit(code)`. On Node, a reader parked
 * inside a blocking `read(2)` makes `process.exit` hang (Node joins worker
 * threads), so stdout is drained and the process ends by SIGKILL — the exit code
 * is then lost, but only when the host never closed a blocking stdin (which used
 * to hang forever). Bun exits fine with the reader parked.
 * @param code - Exit code for the normal path.
 */
export function exitHook(code: number): Promise<never> {
  if ("bun" in process.versions || !readerParkedInSyscall()) return Promise.resolve(process.exit(code));
  return new Promise<never>(() => {
    process.stdout.write("", () => process.kill(process.pid, "SIGKILL"));
  });
}
