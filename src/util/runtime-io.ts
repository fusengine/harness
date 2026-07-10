/**
 * Cross-runtime I/O helpers (Node + Bun). The published CLI ships a `node`
 * shebang and is invoked via `npx`/`npm`/`bunx`/`bun`; using only `node:*` APIs
 * here keeps the bundle runnable under EVERY runtime — replacing the Bun-only
 * `Bun.file/write/spawn/sleep/stdin` calls and the `bun` `Glob` import that made
 * the package crash with `Cannot find package 'bun'` under plain Node.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, type Dirent } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

/** Read a file as UTF-8 text (throws on missing/unreadable — callers catch). */
export function readText(path: string): string {
  return readFileSync(path, "utf8");
}

/** True when `path` exists. */
export function pathExists(path: string): boolean {
  return existsSync(path);
}

/** Write `data` to `path`, creating parent dirs (mirrors `Bun.write`). */
export function writeText(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data, { encoding: "utf8" });
}

/** Resolve after `ms` milliseconds (`Bun.sleep` replacement). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run `cmd args` in `cwd` and capture stdout text ("" on failure/non-zero). */
export function spawnCapture(cmd: string, args: string[], cwd: string): string {
  try {
    const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
    return r.status === 0 ? (r.stdout ?? "") : "";
  } catch {
    return "";
  }
}

/**
 * Read the full process stdin as UTF-8 text (works under Node and Bun).
 * Synchronous fd-0 read — never `for await (const c of process.stdin)` —
 * because Bun has a confirmed Linux-only bug where merely adding a new
 * top-level module import shifts stdin's internal init order and makes
 * that async iterator silently yield zero bytes (oven-sh/bun#25320,
 * #27849): exactly what broke every `harness hook` invocation on CI the
 * moment `figures` became this package's first runtime dependency.
 * `readFileSync(0)` bypasses that stream/ownership machinery entirely and
 * is well-supported for piped (non-TTY) stdin under both runtimes.
 */
export async function readStdin(): Promise<string> {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/**
 * Recursively collect files under `dir` whose extension is in `exts`, skipping
 * `node_modules` and dot-dirs, capped at `cap`. `Bun.Glob().scan()` replacement.
 * @param dir - Directory to walk.
 * @param exts - Allowed extensions including the dot (e.g. `.ts`).
 * @param out - Accumulator (mutated in place).
 * @param cap - Max files to collect.
 */
export function collectFiles(dir: string, exts: ReadonlySet<string>, out: string[], cap: number): void {
  if (out.length >= cap) return;
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (out.length >= cap) return;
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) collectFiles(full, exts, out, cap);
    else if (exts.has(e.name.slice(e.name.lastIndexOf(".")))) out.push(full);
  }
}
