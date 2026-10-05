/**
 * Source of the stdin reader worker (run with `new Worker(code, { eval: true })`,
 * which both Node and Bun support). It is a plain synchronous fd-0 `readSync`
 * loop in its own thread; the main thread never blocks on the descriptor.
 *
 * Shared control words (Int32Array over a SharedArrayBuffer):
 *   [0] chunks sent      [1] chunks consumed (back-pressure)
 *   [2] stop requested   [3] 1 while the worker is (about to be) inside read(2)
 *
 * `EAGAIN` (a non-blocking fd 0, which Node produces as soon as anything touches
 * `process.stdin`) is not an error: the worker sleeps 5 ms and retries, so it is
 * never parked inside a syscall and can honour `stop` promptly.
 */
export const READER_CODE: string = `
const { workerData } = require("node:worker_threads");
const { readSync } = require("node:fs");
const { port, ctl, fd, chunk, maxInflight } = workerData;
const c = new Int32Array(ctl);
const buf = Buffer.alloc(chunk);
let sent = 0;
const send = (msg, transfer) => {
  port.postMessage(msg, transfer);
  sent += 1;
  Atomics.store(c, 0, sent);
  Atomics.notify(c, 0);
};
const leave = () => { Atomics.store(c, 3, 0); Atomics.notify(c, 3); };
try {
  for (;;) {
    for (let used = Atomics.load(c, 1); sent - used >= maxInflight && !Atomics.load(c, 2); used = Atomics.load(c, 1)) Atomics.wait(c, 1, used);
    Atomics.store(c, 3, 1);
    if (Atomics.load(c, 2)) { leave(); break; }
    let n;
    try {
      n = readSync(fd, buf, 0, chunk, null);
    } catch (e) {
      leave();
      if (e && e.code === "EAGAIN") { Atomics.wait(c, 2, 0, 5); continue; }
      throw e;
    }
    leave();
    if (n === 0) { send(null); break; }
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + n);
    send(ab, [ab]);
  }
} catch (e) {
  send({ error: String(e && e.message ? e.message : e) });
}
`;
