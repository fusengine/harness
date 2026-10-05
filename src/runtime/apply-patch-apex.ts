/**
 * Codex `apply_patch` parity with Claude's Write/Edit for the file-keyed gates.
 *
 * Codex writes every file through `apply_patch`, whose normalized event carries
 * `files` but no `filePath` — so {@link runGates} stopped before the skill, APEX
 * (brainstorm, explore + research freshness, doc, SOLID refs) and DRY gates:
 * Codex edits were never APEX-policed. {@link applyPatchGate} (handle-pre.ts)
 * already ran the static per-file gates (protected path, file-size with the
 * post-patch outcome, DRY); this runs the REMAINING ones per file, mapping an
 * `add` to `Write` and an `update` to `Edit`, exactly as applyPatchGate does.
 * @packageDocumentation
 */
import { isAbsolute, join } from "node:path";
import { finalizeGate, runFileGates, runGates } from "./gate";
import { existingLineCounts } from "./gate-helpers";
import { modularGate } from "./modular";
import { detectFramework } from "../policy/detect-framework";
import type { GateInput } from "./gate-input";
import type { NormalizedFile } from "./normalize";
import type { Prompt } from "../prompt/types";

/**
 * The per-file gate input for one patched file.
 * @param input - The tool-level gate input built by handle-pre.ts.
 * @param f - One `add`/`update` entry of the patch.
 * @param toolUseId - Codex `tool_use_id` shared by the sibling hooks of this call.
 * @param index - Position of this entry in the patch: two `*** Update File:` blocks on
 *   the same path are two edits (two budget charges, like two Claude Edits); every
 *   sibling parses the same envelope, so the index is stable across siblings.
 */
function fileInput(input: GateInput, f: NormalizedFile, toolUseId: string | undefined, index: number): GateInput {
  const filePath = isAbsolute(f.filePath) || !input.cwd ? f.filePath : join(input.cwd, f.filePath);
  return {
    ...input,
    // Same detection handle.ts runs for a single-file Write/Edit — the tool-level value was computed with no file (always the project default).
    framework: detectFramework(filePath, f.content, input.cwd),
    tool: f.op === "add" ? "Write" : "Edit",
    filePath,
    content: f.content,
    command: undefined,
    oldString: undefined,
    isReplaceAll: false,
    trivialClaimKey: toolUseId ? `${toolUseId}:${index}:${filePath}` : undefined,
    trivialSlot: index,
  };
}

/**
 * Gate a Codex `apply_patch`: the tool-level chain first (unchanged), then the
 * file-keyed tail for each added/updated file (deletions write no code). The
 * first blocking prompt wins, one-shot/deny-loop bookkeeping runs once.
 * @param input - The tool-level gate input built by handle-pre.ts.
 * @param files - The patch's per-file changes (`event.files`).
 * @param toolUseId - Codex `tool_use_id`, keys the trivial-edit sibling dedup.
 * @returns The decisive prompt, or null when every file passes.
 */
export async function gatePatchFiles(input: GateInput, files: readonly NormalizedFile[], toolUseId?: string): Promise<Prompt | null> {
  const toolPrompt = await runGates(input);
  if (toolPrompt) return finalizeGate(input, toolPrompt, input.command);
  for (const [index, f] of files.entries()) {
    if (f.op === "delete") continue;
    const one = fileInput(input, f, toolUseId, index);
    const path = one.filePath ?? f.filePath;
    const prompt = modularGate(one.tool, path, one.content, one.cwd)
      ?? await runFileGates(one, path, existingLineCounts(path).code, { dry: false });
    if (prompt) return finalizeGate(one, prompt, undefined);
  }
  return finalizeGate(input, null, input.command);
}
