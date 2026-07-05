/**
 * Session-scoped lessons roots registry. The flat {@link module:memory/registry}
 * keeps ONE global list of pending roots — correct mono-session, but wrong with
 * several concurrent Claude Code sessions: at Stop, one session lists (and, by
 * bumping the throttle, STEALS) another session's pending lesson on a project it
 * never touched. This registry keys "which project got code edits, and was its
 * Stop reminder already fired" by `session_id`, so each Stop sees and consumes
 * ONLY its own roots. Stored at `$HOME/.fuse-harness/cache/lessons/session-roots.json`;
 * non-fatal on any I/O failure (a missed reminder never blocks a session).
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { atomicWrite } from "../util/json-io";

/** Per-(session, root) throttle: last code edit vs. last reminder emitted. */
export interface RootMark {
  editedAt: number;
  remindedAt: number;
}
/** One session's edited roots plus an `updatedAt` purge cursor. */
interface SessionEntry {
  updatedAt: number;
  roots: Record<string, RootMark>;
}
/** Whole registry keyed by sanitized `session_id`. */
type Registry = Record<string, SessionEntry>;

/** Registry path (rel. home) + stale-bucket purge horizon (bounds growth). */
const SUBPATH = ".fuse-harness/cache/lessons/session-roots.json";
const PURGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Absolute registry path, or null when home is unusable. */
function file(home: string | undefined): string | null {
  const h = home?.trim();
  return h && h.startsWith("/") ? `${h}/${SUBPATH}` : null;
}

/** Read the registry; missing/corrupt/legacy (array) shapes collapse to `{}`. */
function read(home: string | undefined): Registry {
  const f = file(home);
  if (!f) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(f, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Registry) : {};
  } catch {
    return {};
  }
}

/** Purge stale buckets, then atomically persist (unique tmp + rename). Non-throwing. */
function write(home: string | undefined, reg: Registry, now: number): void {
  const f = file(home);
  if (!f) return;
  for (const [sid, entry] of Object.entries(reg)) {
    if (!entry || now - (entry.updatedAt ?? 0) > PURGE_MS) delete reg[sid];
  }
  try {
    mkdirSync(dirname(f), { recursive: true });
    atomicWrite(f, JSON.stringify(reg));
  } catch {
    /* non-fatal: a missed root never blocks the session */
  }
}

/** Record `field` for `(sid, root)`, refreshing the purge cursor. `home` defaults to `$HOME`. */
export function markSessionRoot(
  sid: string, root: string, field: keyof RootMark, value: number, home: string | undefined = process.env.HOME,
): void {
  const reg = read(home);
  const prev = reg[sid];
  const entry: SessionEntry = prev && typeof prev.roots === "object" && prev.roots !== null ? prev : { updatedAt: value, roots: {} };
  const mark = entry.roots[root] ?? { editedAt: 0, remindedAt: 0 };
  entry.roots[root] = { ...mark, [field]: value };
  entry.updatedAt = value;
  reg[sid] = entry;
  write(home, reg, value);
}

/**
 * Roots of `sid` with an unsaved code edit past the `window`; each returned
 * root's `remindedAt` is bumped to `now` so the reminder fires at most once per
 * window and is consumed ONLY by this session. `home` defaults to `$HOME`.
 */
export function collectSessionPending(
  sid: string, now: number, window: number, home: string | undefined = process.env.HOME,
): string[] {
  const reg = read(home);
  const entry = reg[sid];
  if (!entry || typeof entry.roots !== "object" || entry.roots === null) return [];
  const pending: string[] = [];
  for (const [root, mark] of Object.entries(entry.roots)) {
    if (mark.editedAt <= mark.remindedAt) continue;
    if (now - mark.remindedAt < window) continue;
    pending.push(root);
    entry.roots[root] = { ...mark, remindedAt: now };
  }
  if (pending.length > 0) write(home, reg, now);
  return pending;
}
