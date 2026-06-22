import { mkdir } from "node:fs/promises";
import {
  chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { compactJson } from "./compact-json";

/** Atomically write `data` to `path` (temp + rename, 0o600). Cross-FS safe on macOS/Linux. */
export function atomicWrite(path: string, data: string): void {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmp, data, { encoding: "utf8" });
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* noop */ }
    throw err;
  }
}

/** Ensure a directory exists. */
export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Read & JSON-parse a file; null on missing/corrupt. */
export async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Atomically write JSON (compact form when `compact`). */
export async function writeJsonFile(path: string, data: unknown, compact = false): Promise<void> {
  atomicWrite(path, compact ? compactJson(data) : JSON.stringify(data, null, 2));
}

/** 8-char MD5 of text (cache key; non-cryptographic). Portable Node+Bun. */
export function hashText(text: string): string {
  return createHash("md5").update(text).digest("hex").slice(0, 8);
}
