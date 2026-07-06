import { protectedPathGate } from "../policy/trivial-edits";
import { evaluate } from "../policy/evaluate";
import { dryGate } from "./dry";
import { existingLineCounts } from "./gate-helpers";
import type { NormalizedFile } from "./normalize";
import type { Prompt } from "../prompt/types";

/**
 * OR the static per-file verdict for a Codex `apply_patch` envelope: run the
 * file-level gates (protected-path, SOLID file-size, DRY) that key off
 * `filePath`/`content` over EACH touched file and return the first blocking
 * {@link Prompt}. One violating hunk blocks the whole patch — the parity the
 * single-file `Write`/`Edit` path already has, extended to the multi-file
 * primitive.
 *
 * Only the read-only/pure gates run here (no session-state writes), so the
 * `~11×` hook fan-out stays idempotent — the stateful APEX freshness/skill
 * gates are tool-level and never policed `apply_patch` (its `filePath` was
 * always undefined), so they are intentionally out of scope.
 *
 * File-size tool mapping mirrors Claude: an `add` is judged like a `Write`
 * (full new content), an `update` like an `Edit` (partial content, compared
 * against the on-disk count so an already-oversized file still blocks).
 * @param files - Per-file changes from {@link NormalizedFile}.
 * @param cwd - Project root for the DRY codebase grep.
 * @returns The first blocking prompt, or null when every file passes.
 */
export function applyPatchGate(files: readonly NormalizedFile[], cwd: string): Prompt | null {
  for (const f of files) {
    const tool = f.op === "add" ? "Write" : "Edit";
    const protectedDeny = protectedPathGate(tool, f.filePath);
    if (protectedDeny) return protectedDeny;
    if (f.op === "delete") continue;
    const { raw: existingLines } = existingLineCounts(f.filePath);
    const quick = evaluate({ tool, filePath: f.filePath, content: f.content, existingLines });
    if (quick.decision !== "allow" && quick.prompt) return quick.prompt;
    const dry = dryGate(tool, f.filePath, f.content, cwd);
    if (dry) return dry;
  }
  return null;
}
