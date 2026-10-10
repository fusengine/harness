/**
 * @module motion/hash
 * Content hashing for the motion approval gates. Node-only APIs (`node:crypto`,
 * `node:fs`): the dist runs under Node too, so no `Bun.*` here.
 */
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { createHash } from "node:crypto";

const CHUNK = 1024 * 1024;

/**
 * Full SHA-256 hex digest of a file, streamed in 1 MiB synchronous chunks so a
 * regular artifact never lands in memory at once. No size or time cap applies.
 * Devices/FIFOs fail closed; reads are bounded by the initial file size.
 * File identity, size and modification/change times must remain unchanged.
 * @param path - Absolute file path.
 * @returns The hex digest, or `null` for missing, unreadable, non-regular,
 * or changed files.
 */
export function sha256File(path: string): string | null {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const before = fstatSync(fd);
    if (!before.isFile()) return null;
    const hash = createHash("sha256");
    const buf = Buffer.allocUnsafe(CHUNK);
    let read = 0;
    while (read < before.size) {
      const n = readSync(fd, buf, 0, Math.min(CHUNK, before.size - read), read);
      if (n === 0) return null;
      hash.update(buf.subarray(0, n));
      read += n;
    }
    const after = fstatSync(fd);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) return null;
    return hash.digest("hex");
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* already closed */ }
    }
  }
}

/**
 * Store key of a project root: first 16 hex chars of its SHA-256 (a 32-bit md5
 * like `projectHash` is too collision-prone to key approvals on).
 * @param root - Canonical project root.
 */
export function rootKey(root: string): string {
  return createHash("sha256").update(root).digest("hex").slice(0, 16);
}
