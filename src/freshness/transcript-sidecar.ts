/**
 * Persistence of the incremental transcript index: one small JSON file per
 * transcript inside the (per-project) state dir. Written atomically (tmp + rename) so concurrent hook
 * processes can only ever observe a consistent (cursor, index) pair; a lost
 * write merely costs a re-scan of the bytes since the surviving cursor.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Stamp, TranscriptIndex } from "./transcript-index-record";

/** Bytes of the head / pre-cursor signature guarding the append-only assumption. */
export const SIG_BYTES = 64;

/** Sidecar file-name prefix inside the per-project state dir. */
const PREFIX = "transcript-index-";

/** Persisted state: everything up to `offset` (a line boundary) is folded into `index`. */
export interface Sidecar {
  path: string;
  offset: number;
  /** base64 of the file's first {@link SIG_BYTES} bytes. */
  head: string;
  /** base64 of the {@link SIG_BYTES} bytes just before `offset`. */
  tail: string;
  index: TranscriptIndex;
}

/** Sidecars untouched for longer than this are deleted when a new one is written. */
const STALE_MS = 7 * 24 * 3600 * 1000;

/**
 * Sidecar path for one transcript. The state dir is shared by every session of a
 * project, so the file is keyed by a short hash of the transcript path — two
 * concurrent sessions never overwrite each other's index.
 */
export function sidecarPath(dir: string, transcriptPath: string): string {
  const key = createHash("sha1").update(transcriptPath).digest("hex").slice(0, 16);
  return join(dir, `${PREFIX}${key}.json`);
}

/** Best-effort removal of sibling sidecars untouched for {@link STALE_MS}; never throws. */
function pruneStale(file: string): void {
  try {
    const dir = dirname(file);
    const now = Date.now();
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(PREFIX) || !name.endsWith(".json")) continue;
      const p = join(dir, name);
      if (p === file) continue;
      try {
        if (now - statSync(p).mtimeMs > STALE_MS) unlinkSync(p);
      } catch {
        /* raced with another process — ignore */
      }
    }
  } catch {
    /* best effort */
  }
}

/** True for a `[key, Stamp]` entry list. */
function entries(v: unknown): v is [string, Stamp][] {
  return Array.isArray(v) && v.every((e) => Array.isArray(e) && typeof e[0] === "string" && typeof e[1] === "object" && e[1] !== null);
}

/**
 * Load the sidecar for `transcriptPath`.
 * @returns The persisted state, or `null` when absent, corrupt, or for another transcript.
 */
export function loadSidecar(file: string, transcriptPath: string): Sidecar | null {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const { path, offset, head, tail, agents, refs } = raw;
    if (raw.v !== 1 || path !== transcriptPath || typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0 || typeof head !== "string"
      || typeof tail !== "string" || !entries(agents) || !entries(refs)) return null;
    return { path, offset, head, tail, index: { agents: new Map(agents), refs: new Map(refs) } };
  } catch {
    return null;
  }
}

/** Atomically persist `s`; failures are swallowed (the index is only a cache). */
export function saveSidecar(file: string, s: Sidecar): void {
  try {
    const tmp = `${file}.${process.pid}.tmp`;
    const body = { v: 1, path: s.path, offset: s.offset, head: s.head, tail: s.tail, agents: [...s.index.agents], refs: [...s.index.refs] };
    writeFileSync(tmp, JSON.stringify(body), "utf8");
    renameSync(tmp, file);
    pruneStale(file);
  } catch {
    /* cache only — never fail the hook */
  }
}
