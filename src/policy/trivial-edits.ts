import type { Prompt } from "../prompt/types";

/**
 * Pre-filters of the ported enforce-apex-phases.ts hook, in Python order
 * (lines 48-65): protected-path guard first, then the dependency/build-dir
 * skip, then the trivial-edit fast path. The trivial COUNTER itself lives in
 * the SessionTrack (`trivialEdits`, see recordTrivialEdit/trivialCount) — no
 * separate state file.
 */

/** Hook-managed state paths — Write/Edit always denied (parity enforce-apex-phases.ts PROTECTED_PATHS). */
export const PROTECTED_PATHS: RegExp = /\.claude\/(plugins\/(marketplaces|cache)|logs\/00-apex|fusengine-cache\/skill-tracking)/;

/** Dependency/build dirs the APEX gates skip entirely (parity enforce-apex-phases.ts SKIP_DIRS). */
export const SKIP_DIRS: RegExp = /(node_modules|vendor|dist|build|\.next|DerivedData)/;

/**
 * Absolute deny on Write/Edit of hook-managed state paths, with the Python
 * wording byte-for-byte. Runs BEFORE the code-ext/skip-dirs filters (parity
 * enforce-apex-phases.ts:48-54), so non-code files under the protected roots
 * are covered too.
 * @param tool - The harness tool name (only Write/Edit are policed).
 * @param filePath - Target path of the edit (or undefined).
 * @returns A blocking prompt, or null to fall through.
 */
export function protectedPathGate(tool: string, filePath: string | undefined): Prompt | null {
  if ((tool !== "Write" && tool !== "Edit") || !filePath || !PROTECTED_PATHS.test(filePath)) return null;
  return {
    kind: "block",
    title: "APEX Hook Guard: protected path",
    reason:
      "[APEX Hook Guard] Write blocked — this path is managed automatically by APEX hooks. Manual edits are forbidden and would corrupt tracked state.",
  };
}

/** An Edit whose new_string spans fewer lines than this is "trivial" (parity: < 5). */
export const TRIVIAL_MAX_LINES = 5;

/**
 * True when this tool-use qualifies for the trivial fast path (parity
 * enforce-apex-phases.ts:58-65): only an Edit (a Write always creates or
 * replaces a file wholesale), NEVER `replace_all`, and a new_string under
 * {@link TRIVIAL_MAX_LINES} lines. Absent content is NOT trivial (fail closed
 * — the full gates run).
 * @param tool - The harness tool name.
 * @param content - The Edit's new_string (adapter-normalized).
 * @param isReplaceAll - The Edit's replace_all flag.
 */
export function isTrivialEdit(tool: string, content: string | undefined, isReplaceAll?: boolean): boolean {
  if (tool !== "Edit" || isReplaceAll === true || content === undefined) return false;
  return content.split("\n").length < TRIVIAL_MAX_LINES;
}
