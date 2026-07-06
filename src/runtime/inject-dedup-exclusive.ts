/**
 * @module inject-dedup-exclusive
 * Cross-process-exact-once cooldown gate, via EXCLUSIVE file creation.
 *
 * {@link module:inject-dedup.oncePerWindow}'s shared-JSON read-modify-write is
 * best-effort under true concurrency: the ~11-process plugin hook fan-out for
 * one Claude event can lose an update and let 2-3 siblings all observe "not
 * seen yet" (lesson 2026-07-05 16:00 — the `saveTrack` lost-update race, same
 * shape). `writeFileSync(path, data, { flag: "wx" })` sidesteps this: the OS
 * guarantees exclusive creation is atomic, so of N concurrent siblings calling
 * this for the SAME key, exactly one observes success and the rest get
 * `EEXIST` — never a double-win, with no lock file or retry loop needed.
 *
 * One marker file per key (not a shared map) is the tradeoff for that
 * guarantee. A bounded sweep on every call deletes markers older than
 * `windowMs` so the directory never grows unbounded under many distinct keys.
 *
 * Reserve this for HIGH-CONCURRENCY callers on a short burst window (same
 * tool-use/lifecycle event fanned out to every installed plugin) — e.g. the
 * sniper reminder ({@link module:lifecycle/track-changes}) and compliance
 * notices ({@link module:notices}). Low-frequency, long-window callers (e.g.
 * the 30-min lessons Stop-reminder cooldown) are fine on the JSON mode: a
 * single real Stop event per session is not concurrent with itself the way
 * one PostToolUse's ~11 sibling hooks are within the same 2s burst.
 * @packageDocumentation
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultStateDir } from "./paths";
import type { OnceOpts } from "./inject-dedup";

/** Subdirectory (under the state dir) holding one marker file per dedup key. */
const EXCLUSIVE_SUBDIR = "inject-dedup-locks";

/**
 * Filesystem-safe, collision-resistant basename for `key`. Full MD5 hex
 * (unlike {@link module:util/json-io.hashText}'s 8-char truncation) — a
 * collision here would silently merge two unrelated keys' exclusivity.
 */
function lockFileName(key: string): string {
  return `${createHash("md5").update(key).digest("hex")}.lock`;
}

/**
 * Delete marker files older than `windowMs` in `dir` — O(n) per call, bounds
 * directory growth. Compares against the creation timestamp STORED IN the
 * marker's content (written by {@link onceExclusive} below), not the file's
 * fs `mtime`: callers may pass a fake logical `now` (tests), which would never
 * agree with the real OS clock backing `mtime`.
 */
function sweepExclusiveDir(dir: string, now: number, windowMs: number): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    try {
      const createdAt = Number(readFileSync(path, "utf8"));
      if (!Number.isFinite(createdAt) || now - createdAt >= windowMs) unlinkSync(path);
    } catch {
      /* a sibling process already swept/removed it, or a transient read race — ignore */
    }
  }
}

/**
 * Cooldown gate via exclusive marker-file creation. Returns `true` exactly
 * once per `key` within `windowMs` across ALL concurrent processes sharing
 * `opts.dir` (the caller MAY emit), `false` for every other concurrent or
 * subsequent call inside the same window (the caller SHOULD suppress).
 *
 * Fails open on any unwritable state dir or unexpected fs error: the emission
 * is allowed rather than silently dropped.
 * @param key - Stable identity of the block (same semantics as {@link module:inject-dedup.oncePerWindow}).
 * @param windowMs - Suppression window in ms (also the sweep threshold).
 * @param opts - Optional clock + state-dir overrides (for tests).
 * @returns `true` to proceed/emit, `false` to suppress.
 */
export function onceExclusive(key: string, windowMs: number, opts: OnceOpts = {}): boolean {
  const now = opts.now ?? Date.now();
  const dir = join(opts.dir ?? defaultStateDir(), EXCLUSIVE_SUBDIR);
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    return true;
  }
  sweepExclusiveDir(dir, now, windowMs);
  try {
    writeFileSync(join(dir, lockFileName(key)), String(now), { flag: "wx" });
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== "EEXIST";
  }
}
