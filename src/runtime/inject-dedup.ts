/**
 * @module inject-dedup
 * Generic "once per window" guard for hook context injection.
 *
 * Persists a tiny sidecar map `{ key -> lastEmittedEpochMs }` in the existing
 * per-project state dir (`~/.fuse-harness/state/<projectHash>/inject-dedup.json`,
 * the same dir as the session track — see {@link defaultStateDir}). Lets a caller
 * suppress a block it has already emitted within a short window, defending
 * against the "same content emitted by two near-simultaneous hooks" family
 * (cf. the 0.1.48 SubagentStart double-inject). Also reused as a cooldown gate.
 *
 * Best-effort under true process-level concurrency (the read-modify-write is not
 * locked); reliable for the sequential single-process callers that use it.
 * @packageDocumentation
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWrite } from "../util/json-io";
import { defaultStateDir } from "./paths";

/** Default suppression window (ms): catches same-turn double-fire, not next-turn re-emits. */
export const DEDUP_WINDOW_MS = 3000;

/** Sidecar basename under the per-project state dir. */
const SIDECAR = "inject-dedup.json";

/** Optional overrides — tests inject a clock + a scratch dir; production omits both. */
export interface OnceOpts {
  /** Clock in epoch-ms (default `Date.now()`). */
  now?: number;
  /** State-dir override (default {@link defaultStateDir}). */
  dir?: string;
}

/** Load the `{ key -> epochMs }` map, or `{}` when missing/corrupt. */
function loadMap(path: string): Record<string, number> {
  try {
    if (!existsSync(path)) return {};
    const data: unknown = JSON.parse(readFileSync(path, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Keep only entries newer than `windowMs` before `now` (bounds sidecar size). */
function prune(map: Record<string, number>, now: number, windowMs: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, t] of Object.entries(map)) {
    if (typeof t === "number" && now - t < windowMs) out[k] = t;
  }
  return out;
}

/**
 * Cooldown gate. Returns `true` when `key` has NOT been recorded within the last
 * `windowMs` (the caller MAY emit — and the emission is recorded now), or `false`
 * when it was (the caller SHOULD suppress). The first call in a window wins;
 * subsequent identical keys are throttled until the window elapses.
 *
 * Fails open: if the sidecar is unwritable, the emission is allowed rather than
 * silently dropping context.
 * @param key - Stable identity of the block (e.g. a content hash, or `lesson:<id>`).
 * @param windowMs - Suppression window in ms.
 * @param opts - Optional clock + state-dir overrides (for tests).
 * @returns `true` to proceed/emit, `false` to suppress.
 */
export function oncePerWindow(key: string, windowMs: number, opts: OnceOpts = {}): boolean {
  const now = opts.now ?? Date.now();
  const path = join(opts.dir ?? defaultStateDir(), SIDECAR);
  const map = prune(loadMap(path), now, windowMs);
  const last = map[key];
  if (typeof last === "number" && now - last < windowMs) return false;
  map[key] = now;
  try {
    atomicWrite(path, JSON.stringify(map));
  } catch {
    /* sidecar unwritable → fail-open: allow the emission rather than lose context */
  }
  return true;
}
