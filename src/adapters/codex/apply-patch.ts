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
 * - Update File: APPROXIMATE — only the hunk "new side" (context ` ` + added `+`
 *   lines) is reconstructed, not the full post-edit file. It is a lower bound on
 *   the file's size (callers pair it with the on-disk count for oversized-file
 *   edits), never the exact result.
 * - Delete File: no content (empty).
 */

/** One file touched by an apply_patch envelope. */
export interface PatchedFile {
  path: string;
  content: string;
  op: "add" | "update" | "delete";
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
 * Parse a Codex freeform patch into its per-file changes. Lenient on whitespace
 * around structural markers (as Codex's own parser is); returns `[]` when no
 * recognizable hunk is present (malformed input fails open, not closed).
 * @param text - Raw patch body from `tool_input.command`.
 * @returns One {@link PatchedFile} per Add/Update/Delete hunk, in order.
 */
export function parseApplyPatch(text: string): PatchedFile[] {
  const files: PatchedFile[] = [];
  let cur: PatchedFile | null = null;
  let buf: string[] = [];
  const flush = (): void => {
    if (cur) {
      cur.content = buf.join("\n");
      files.push(cur);
    }
    cur = null;
    buf = [];
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
    // Update hunk: keep the "new side" (added `+` + context ` `), drop removed `-`
    // and `@@` chunk headers.
    if (line.startsWith("@@")) continue;
    if (line.startsWith("+")) buf.push(line.slice(1));
    else if (line.startsWith("-")) continue;
    else buf.push(line.startsWith(" ") ? line.slice(1) : line);
  }
  flush();
  return files;
}
