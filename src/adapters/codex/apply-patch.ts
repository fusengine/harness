/**
 * Parser for Codex's freeform `apply_patch` tool payload — the platform's PRIMARY
 * edit primitive. The PreToolUse hook delivers `tool_name: "apply_patch"` with
 * `tool_input: { command: <raw patch text> }` (verified in the Codex source:
 * `core/src/tools/handlers/apply_patch.rs::pre_tool_use_payload`, which emits
 * `json!({ "command": <freeform patch> })`). The grammar is the official
 * apply-patch Lark spec (`apply-patch/src/parser.rs`): a single patch envelope
 * can carry MULTIPLE files.
 *
 * Content precision (for the file-size / DRY gates that key off `content`):
 * - Add File: EXACT — every `+` line is the new file verbatim.
 * - Update File: `content` is the merged "new side" (context ` ` + added `+`
 *   lines) of the WHOLE block, never the full post-edit file — the same shape
 *   every `event.files` consumer has always seen. The per-`@@`-chunk detail
 *   the SOLID file-size gate needs to judge the file AFTER the patch travels
 *   separately in {@link PatchedFile.hunks}, as old/new text pairs the gate
 *   applies to the real file before counting.
 * - Delete File: no content (empty).
 */

/**
 * One `@@` chunk of an Update File block (`codex-rs/apply-patch`'s
 * `UpdateFileChunk`): the old side (context ` ` + removed `-` lines) and the
 * new side (context ` ` + added `+` lines), each `\n`-joined. A bare `+` or a
 * blank context line yields an empty element, so a chunk ending on one ends
 * with a trailing `\n` — the file-size gate applies the chunk to the real
 * file text before counting, never counting the joined chunk on its own.
 * An empty `oldString` is a pure-add chunk (Codex appends it at end of file).
 */
export interface PatchHunk {
  oldString: string;
  newString: string;
  /** True when the new side has NO lines at all (pure deletion) — distinct from a single blank line, which also joins to `""`. */
  deletion?: true;
}

/** One file touched by an apply_patch envelope. */
export interface PatchedFile {
  path: string;
  content: string;
  op: "add" | "update" | "delete";
  /** Update only: one pre-sized entry per `@@` chunk, in patch order. Absent for add/delete. */
  hunks?: PatchHunk[];
}

const BEGIN = "*** Begin Patch";
const END = "*** End Patch";
const ADD = "*** Add File: ";
const DEL = "*** Delete File: ";
const UPD = "*** Update File: ";
const MOVE = "*** Move to: ";
const EOF = "*** End of File";
const ENV = "*** Environment ID: ";

/**
 * Parse a Codex freeform patch into its per-file changes. Lenient on
 * whitespace around structural markers (as Codex's own parser is); returns
 * `[]` when no recognizable hunk is present (malformed input fails open, not
 * closed).
 *
 * An Update File block may stack several `@@`-introduced chunks (the official
 * grammar's `change_context`, one per non-contiguous edit location —
 * `codex-rs/apply-patch/src/parser.rs`'s `Hunk::UpdateFile { chunks }`). They
 * stay ONE {@link PatchedFile}; each chunk is recorded in `hunks`.
 * @param text - Raw patch body from `tool_input.command`.
 * @returns One {@link PatchedFile} per Add/Update/Delete hunk, in order.
 */
export function parseApplyPatch(text: string): PatchedFile[] {
  const files: PatchedFile[] = [];
  let cur: PatchedFile | null = null;
  let buf: string[] = [];
  let oldBuf: string[] = [];
  let newBuf: string[] = [];
  let hunks: PatchHunk[] = [];
  const flushChunk = (): void => {
    // A chunk whose old side is only blank lines (e.g. a lone blank context
    // line after `@@`) cannot be located and is not a pure-add: drop it rather
    // than mis-file it as an append (which would over-count by one).
    const oldString = oldBuf.join("\n");
    if ((oldBuf.length === 0 && newBuf.length > 0) || oldString !== "") {
      hunks.push(newBuf.length === 0 ? { oldString, newString: "", deletion: true } : { oldString, newString: newBuf.join("\n") });
    }
    oldBuf = [];
    newBuf = [];
  };
  const flush = (): void => {
    if (cur) {
      flushChunk();
      cur.content = buf.join("\n");
      if (cur.op === "update") cur.hunks = hunks;
      files.push(cur);
    }
    cur = null;
    buf = [];
    hunks = [];
  };
  for (const line of text.split("\n")) {
    const marker = line.trimStart();
    if (marker === BEGIN || marker.startsWith(ENV)) continue;
    if (marker === END) {
      flush();
      continue;
    }
    if (marker.startsWith(ADD)) {
      flush();
      cur = { path: marker.slice(ADD.length).trim(), content: "", op: "add" };
      continue;
    }
    if (marker.startsWith(DEL)) {
      flush();
      files.push({ path: marker.slice(DEL.length).trim(), content: "", op: "delete" });
      continue;
    }
    if (marker.startsWith(UPD)) {
      flush();
      cur = { path: marker.slice(UPD.length).trim(), content: "", op: "update" };
      continue;
    }
    if (marker.startsWith(MOVE)) {
      if (cur) cur.path = marker.slice(MOVE.length).trim();
      continue;
    }
    if (marker === EOF || !cur) continue;
    if (cur.op === "add") {
      if (line.startsWith("+")) buf.push(line.slice(1));
      continue;
    }
    // Update hunk: `content` keeps the "new side" (added `+` + context ` `)
    // across every chunk; `@@` opens a new chunk (a bare header with nothing
    // accumulated before it is a no-op, matching a stacked narrowing pair).
    if (line.startsWith("@@")) {
      flushChunk();
      continue;
    }
    if (line.startsWith("+")) {
      buf.push(line.slice(1));
      newBuf.push(line.slice(1));
    } else if (line.startsWith("-")) {
      oldBuf.push(line.slice(1));
    } else {
      const ctx = line.startsWith(" ") ? line.slice(1) : line;
      buf.push(ctx);
      oldBuf.push(ctx);
      newBuf.push(ctx);
    }
  }
  flush();
  return files;
}
