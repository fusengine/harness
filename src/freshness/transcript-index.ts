/**
 * Memory-bounded, incremental evidence index of a (possibly huge) append-only
 * transcript. The file is streamed in fixed chunks (never loaded whole); a
 * per-session sidecar persists the byte cursor + index so each later hook only
 * reads the bytes appended since. Without a state dir it streams the whole file
 * once per process (memoized by path+inode+size+mtime). Verdict-exact: the index
 * keeps the max stamp per key, so no timestamp-ordering assumption is made.
 */
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { scanLines } from "./transcript-lines";
import { cloneIndex, emptyIndex, foldLine, type TranscriptIndex } from "./transcript-index-record";
import { loadSidecar, saveSidecar, SIG_BYTES, sidecarPath } from "./transcript-sidecar";

const memo = new Map<string, TranscriptIndex>();

/** Test hook: forget the per-process memo. */
export function clearTranscriptMemo(): void {
  memo.clear();
}

/** Base64 of `len` bytes at `pos` (append-only signature), or `null` when unreadable. */
function signature(fd: number, pos: number, len: number): string | null {
  if (len <= 0) return "";
  const buf = Buffer.alloc(len);
  return readSync(fd, buf, 0, len, pos) === len ? buf.toString("base64") : null;
}

/**
 * Index `transcriptPath` (agents dispatched/explored + `.md` reads), reusing the
 * sidecar in `dir` when the file is a verified append-only continuation of it.
 * @param transcriptPath - Session `.jsonl` transcript.
 * @param dir - Per-session state dir for the sidecar; omit for a stateless scan.
 * @param chunkBytes - Read chunk size override (tests use tiny chunks to straddle boundaries).
 * @returns The index, or `null` when the transcript is absent/unreadable (callers fail-open).
 */
export function loadTranscriptIndex(transcriptPath: string, dir?: string, chunkBytes?: number): TranscriptIndex | null {
  let fd = -1;
  try {
    const st = statSync(transcriptPath);
    const key = `${dir ?? ""}|${transcriptPath}|${st.ino}|${st.size}|${st.mtimeMs}`;
    const hit = memo.get(key);
    if (hit) return hit;
    fd = openSync(transcriptPath, "r");
    const file = dir ? sidecarPath(dir, transcriptPath) : null;
    const side = file ? loadSidecar(file, transcriptPath) : null;
    let idx = emptyIndex();
    let from = 0;
    if (side && side.offset <= st.size && side.head === signature(fd, 0, Math.min(SIG_BYTES, st.size))
      && side.tail === signature(fd, side.offset - Math.min(SIG_BYTES, side.offset), Math.min(SIG_BYTES, side.offset))) {
      idx = side.index;
      from = side.offset;
    }
    const { cursor, rest } = scanLines(fd, from, st.size, (line) => foldLine(idx, line), chunkBytes);
    if (file && cursor > from) {
      const head = signature(fd, 0, Math.min(SIG_BYTES, st.size));
      const tail = signature(fd, cursor - Math.min(SIG_BYTES, cursor), Math.min(SIG_BYTES, cursor));
      if (head !== null && tail !== null) saveSidecar(file, { path: transcriptPath, offset: cursor, head, tail, index: idx });
    }
    const result = rest && rest.length > 0 ? cloneIndex(idx) : idx;
    if (rest && rest.length > 0) foldLine(result, rest);
    memo.set(key, result);
    return result;
  } catch {
    return null;
  } finally {
    if (fd >= 0) closeSync(fd);
  }
}
