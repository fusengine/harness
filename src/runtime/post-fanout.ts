import type { NormalizedEvent } from "./normalize";

/**
 * Fan a Codex `apply_patch` envelope's `event.files` into one synthetic
 * per-file event per touched file, so the per-file PostToolUse gates (SOLID
 * size, Tailwind, tracking, post-edit context) see EACH file instead of the
 * whole patch (whose own `filePath`/`content` are always undefined). `add`
 * maps to `Write`, `update` to `Edit` (mirrors the Pre-phase `applyPatchGate`'s
 * tool mapping); `delete`/`move` map to a tool none of those Write|Edit-gated
 * checks recognize, so they no-op on it without special-casing each gate.
 * Returns `[event]` unchanged for every non-`apply_patch` tool/harness.
 * @param event - The normalized PostToolUse event.
 * @returns One event per touched file, or the original event.
 */
export function fanOutFiles(event: NormalizedEvent): NormalizedEvent[] {
  if (!event.files || event.files.length === 0) return [event];
  return event.files.map((f) => ({
    ...event,
    tool: f.op === "add" ? "Write" : f.op === "update" ? "Edit" : "apply_patch:delete",
    filePath: f.filePath,
    content: f.op === "delete" ? undefined : f.content,
  }));
}

/**
 * Run `check(tool, filePath)` over each fanned-out file, OR-ing the verdict —
 * the first non-empty result wins (parity with `applyPatchGate`'s "one
 * violating hunk blocks the whole envelope").
 * @param files - Per-file events from {@link fanOutFiles}.
 * @param check - A PostToolUse gate keyed on `(tool, filePath)`.
 * @returns The first non-empty result, or `""` when every file is clean.
 */
export function firstFileMatch(files: readonly NormalizedEvent[], check: (tool: string, filePath: string) => string): string {
  for (const f of files) {
    if (!f.filePath) continue;
    const result = check(f.tool, f.filePath);
    if (result) return result;
  }
  return "";
}
