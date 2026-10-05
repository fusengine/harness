/** Control-word indexes shared with the reader worker (see `stdin-reader-code.ts`). */
export const SENT = 0, CONSUMED = 1, STOP = 2, READING = 3;

/** Process-wide state of the (optional) stdin reader worker. */
export const readerState: { blocked: boolean; ctl: Int32Array | undefined } = { blocked: false, ctl: undefined };
