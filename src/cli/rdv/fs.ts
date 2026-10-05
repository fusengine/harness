/**
 * Synchronous filesystem primitives of the rendezvous. Light (node:* only).
 * Everything here may throw on a disk/permission fault; callers treat ANY throw
 * as "degrade to the standalone path" (see `follower.ts`).
 */
import { createHash } from "node:crypto";
import {
  closeSync, existsSync, linkSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync,
} from "node:fs";

const SLEEP_CELL = new Int32Array(new SharedArrayBuffer(4));

/** Block the thread for `ms` (verified on Bun + Node main thread). */
export function sleepSync(ms: number): void {
  Atomics.wait(SLEEP_CELL, 0, 0, ms);
}

/** Event key: hash of host id + cwd + the exact stdin bytes (32 hex chars). */
export function eventKey(id: string, cwd: string, text: string): string {
  return createHash("sha256").update(id).update("\0").update(cwd).update("\0").update(text).digest("hex").slice(0, 32);
}

/**
 * Create `path` exclusively (`O_CREAT|O_EXCL`): exactly one concurrent caller wins.
 * @returns true when this call created the file, false when it already existed.
 */
export function tryExclusive(path: string, content = ""): boolean {
  let fd: number;
  try {
    fd = openSync(path, "wx");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw e;
  }
  try { if (content) writeSync(fd, content); } finally { closeSync(fd); }
  return true;
}

let tmpSeq = 0;

/**
 * Exclusive create WITH content, atomically: temp file + `link` (EEXIST = lost).
 * Readers can therefore never observe the file empty (unlike `wx` + write).
 * @returns true when this call created `path`, false when it already existed.
 */
export function tryExclusiveWith(path: string, content: string): boolean {
  const tmp = `${path}.${process.pid}.${tmpSeq++}.tmp`;
  writeFileSync(tmp, content);
  try {
    linkSync(tmp, path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw e;
  } finally {
    try { unlinkSync(tmp); } catch { /* best effort */ }
  }
}

/** Write `data` so readers never see a partial file (same-dir temp + rename). */
export function writeAtomic(path: string, data: string): void {
  const tmp = `${path}.${process.pid}.${tmpSeq++}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

/** File text, or null when missing/unreadable. */
export function readText(path: string): string | null {
  try { return readFileSync(path, "utf8"); } catch { return null; }
}

/** True when `path` exists. */
export function exists(path: string): boolean {
  return existsSync(path);
}

/** Age of `path` in ms (mtime), or Infinity when it does not exist. */
export function ageMs(path: string, now: number = Date.now()): number {
  try { return now - statSync(path).mtimeMs; } catch { return Number.POSITIVE_INFINITY; }
}

/**
 * Liveness of `pid` via signal 0: ESRCH = gone, EPERM = alive (not ours).
 * A zombie still reads as alive, which only delays a takeover to `hardMs`.
 */
export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}
