import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Age of a file in seconds (now - mtime). Infinity when unstat-able. */
function ageSec(path: string, now: number): number {
  try {
    return (now - statSync(path).mtimeMs) / 1000;
  } catch {
    return Infinity;
  }
}

/** Remove files directly under `dir` matching `test` older than `maxAgeSec`. */
export function removeOldFiles(dir: string, test: (name: string) => boolean, maxAgeSec: number, now: number = Date.now()): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (test(name) && ageSec(path, now) > maxAgeSec) {
      try { rmSync(path, { force: true }); } catch { /* best effort */ }
    }
  }
}

/** Trim `file` to its last `keepLines` lines when it exceeds `maxBytes`. */
export function trimLogFile(file: string, maxBytes: number, keepLines: number): void {
  try {
    if (!existsSync(file) || statSync(file).size <= maxBytes) return;
    const lines = readFileSync(file, "utf-8").split("\n");
    writeFileSync(file, lines.slice(-keepLines).join("\n"), "utf-8");
  } catch { /* best effort */ }
}

/** Recursively purge files under `root/<top>` older than `ttls[top]` seconds. */
export function purgeTtlTree(root: string, ttls: Record<string, number>, now: number = Date.now()): void {
  if (!existsSync(root)) return;
  for (const [top, ttlSec] of Object.entries(ttls)) {
    walkPurge(join(root, top), ttlSec, now);
  }
}

function walkPurge(dir: string, ttlSec: number, now: number): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    let isDir = false;
    try { isDir = statSync(path).isDirectory(); } catch { continue; }
    if (isDir) { walkPurge(path, ttlSec, now); continue; }
    if (ageSec(path, now) > ttlSec) {
      try { rmSync(path, { force: true }); } catch { /* best effort */ }
    }
  }
}

/** Bottom-up removal of empty subdirs under each `root/<top>` (best effort). */
export function pruneEmptyDirs(root: string, tops: string[]): void {
  for (const top of tops) {
    const sub = join(root, top);
    if (!existsSync(sub)) continue;
    pruneEmpty(sub, sub);
  }
}

function pruneEmpty(dir: string, stopAt: string): void {
  for (const name of existsSync(dir) ? readdirSync(dir) : []) {
    const path = join(dir, name);
    try { if (statSync(path).isDirectory()) pruneEmpty(path, stopAt); } catch { /* skip */ }
  }
  if (dir !== stopAt && relative(stopAt, dir).split(sep)[0] !== "..") {
    try { rmdirSync(dir); } catch { /* non-empty or gone */ }
  }
}
