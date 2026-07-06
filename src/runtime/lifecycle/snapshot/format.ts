import { contextResponse } from "../../../adapters/claude";
import { capFragment, budgetReport } from "../../inject-budget";

/** A titled snapshot section — dropped from the render when its `body` is empty. */
export interface Section {
  title: string;
  body: string;
}

/**
 * Render the non-empty `sections` under one reconciliation heading. Empty
 * sections are dropped; when every section is empty the whole snapshot is `""`.
 * Each surviving section is passed through {@link capFragment} (harness-produced
 * content, not owner CLAUDE.md), and a trailing {@link budgetReport} line gives
 * the owner-requested numeric visibility into what was actually injected.
 * @param sections - The collected sections in display order.
 * @returns The assembled markdown block, or `""` when nothing to report.
 */
export function renderSections(sections: Section[]): string {
  const kept = sections
    .filter((s) => s.body.trim())
    .map((s) => ({ title: s.title, body: capFragment(s.title, s.body.trim()) }));
  if (!kept.length) return "";
  const header =
    "# Reconciliation snapshot\nReal state of the world at session start — reconcile against this instead of re-discovering it.";
  const parts = kept.map((s) => `### ${s.title}\n${s.body}`);
  const report = budgetReport(kept.map((s) => ({ label: s.title, chars: s.body.length })));
  return `${header}\n\n${parts.join("\n\n")}\n\n_${report}_`;
}

/**
 * Concatenate `snapshot` onto an existing SessionStart stdout's
 * `additionalContext` — it never replaces prior injected context (CLAUDE.md,
 * dev-context). When `stdout` is empty a fresh {@link contextResponse} is made;
 * a non-empty but unparseable `stdout` is returned UNCHANGED (the snapshot is
 * dropped) — fabricating a fresh response there would discard the very CLAUDE.md
 * injection the invariant protects, so preserving prior context always wins.
 * @param stdout - The core SessionStart JSON stdout (may be `""`).
 * @param snapshot - The snapshot markdown to append (no-op when `""`).
 * @returns The merged hook stdout JSON.
 */
export function attachSnapshot(stdout: string, snapshot: string): string {
  if (!snapshot) return stdout;
  if (!stdout) return contextResponse("SessionStart", snapshot);
  try {
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput?: { additionalContext?: string };
    };
    const prev = parsed.hookSpecificOutput?.additionalContext ?? "";
    const merged = prev ? `${prev}\n\n${snapshot}` : snapshot;
    return JSON.stringify({
      ...parsed,
      hookSpecificOutput: { ...parsed.hookSpecificOutput, hookEventName: "SessionStart", additionalContext: merged },
    });
  } catch {
    // Unparseable non-empty stdout: keep it verbatim so prior injected context
    // (CLAUDE.md) is never discarded — the snapshot is sacrificed, not the invariant.
    return stdout;
  }
}
