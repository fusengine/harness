/**
 * @module design-files-gate
 * Gates for multi-file write primitives (Codex `apply_patch`, fanned into
 * `event.files` by normalize.ts): apply_patch IS the Write tool under Codex,
 * so the design pipeline must see it. Per op, because `content` means
 * different things (apply-patch.ts:10-15):
 *  - add:    content IS the full new document — content-gated like a Write;
 *  - update: content is the hunk's new side, APPROXIMATE, never the document —
 *            only content-independent gates run (path, state-file, phase/quota).
 *            No BLOCKING or DEGRADING validation on this path — promote-only:
 *            the POST re-reads the real file, a clean content promotes to
 *            phase 3, a dirty one changes nothing. And it would not bite
 *            anyway: designSystemValid is consumed ONLY under
 *            FUSE_DESIGN_GEMINI=1 (off by default — an informational flag),
 *            and designSystemExists is never read after init;
 *  - delete: skipped (parity with the sibling applyPatchGate).
 * One violating file blocks the whole envelope. KNOWN GAPS (documented, out
 * of scope): apply_patch also bypasses uiDesignSkillGate and the Gemini
 * create_frontend precondition; htmlCssOnlyGate stays excluded (owner D2);
 * and `Design-System.md` (case) escapes every endsWith check, here and on
 * Write — a real bypass on case-insensitive macOS, not widened now.
 * @packageDocumentation
 */
import type { Prompt } from "../prompt/types";
import type { NormalizedFile } from "./normalize";
import type { DesignState } from "../policy/design/state";
import { pluginsWriteGuard } from "../policy/design/corpus";
import { stateFileGate } from "../policy/design/gates";
import { designSystemWriteGate } from "../policy/design/gates-pipeline";
import { designSystemContentGate } from "./design-content-gate";

/**
 * Literal substitution, first occurrence or all — NEVER String.replace's
 * replacement-string semantics: an agent-controlled new_string of `$&`, `` $` ``,
 * `$'` or `$$` must be written (and validated) literally, not interpreted as
 * the matched text (that made the gate validate a document the tool would
 * never write — the `$&` bypass). Used on both sides: PRE reconstruction and
 * POST reverse-reconstruction.
 */
export function substituteLiteral(s: string, from: string, to: string, all: boolean): string {
  return all ? s.split(from).join(to) : s.replace(from, () => to);
}

/** Gate every file of a multi-file write primitive; the first violation blocks the envelope. */
export function designFilesGate(
  files: readonly NormalizedFile[],
  state: DesignState,
  pluginsRoot: string,
  corpusRoot: string,
  corpusRequired: boolean,
  cwd: string,
): Prompt | null {
  for (const f of files) {
    const hit = pluginsWriteGuard(f.filePath, pluginsRoot, cwd) ?? stateFileGate(f.filePath);
    if (hit) return hit;
    if (f.op === "delete") continue;
    if (!f.filePath.endsWith("design-system.md")) continue;
    const gate = designSystemWriteGate(f.filePath, state, corpusRequired)
      ?? (f.op === "add"
        ? designSystemContentGate({ filePath: f.filePath, tool: "Write", content: f.content, oldString: undefined, replaceAll: false, state, corpusRoot, corpusRequired })
        : null);
    if (gate) return gate;
  }
  return null;
}
