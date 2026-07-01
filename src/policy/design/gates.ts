import type { Prompt } from "../../prompt/types";
import type { DesignState } from "./state";

export const ALLOWED_WRITE: RegExp = /\.(html|css|md|json)$/;
export const EXEMPT_DIRS: readonly string[] = ["node_modules/", "dist/", "build/", ".claude/"];
const FORBIDDEN_FONTS: readonly string[] = ["Inter", "Roboto", "Arial", "Open Sans"];
const OKLCH_RE = /oklch\(\s*[\d.]+%?\s+0\.0*[1-9]/;

export const deny = (reason: string): Prompt => ({
  kind: "block", title: "Design pipeline", reason,
  actions: ["Follow the design pipeline phases (0→identity, 1→inspiration, 2→screenshots, 3→design-system, 4→generate) in order"],
});

/** Block the design agent from writing anything but .html/.css/.md/.json. */
export function htmlCssOnlyGate(filePath: string): Prompt | null {
  if (EXEMPT_DIRS.some((d) => filePath.includes(d)) || ALLOWED_WRITE.test(filePath)) return null;
  return deny(
    "BLOCKED: design-expert can only write .html, .css, .md, and .json files. " +
      "Framework files (.tsx, .astro, .vue, .swift, .php) must be written by the domain expert " +
      "(astro-expert, react-expert, etc.) AFTER design validation.",
  );
}

/** Block edits to the harness-managed `.design-state-*` files (read-only to the agent). */
export function stateFileGate(filePath: string): Prompt | null {
  return filePath.includes(".design-state-")
    ? deny(
        "BLOCKED: .design-state files are READ-ONLY for you. Hooks update them automatically as you progress. " +
          "Do NOT try to modify them — it will not unblock you. Follow the pipeline: Phase 0→1→2→3→4→5→6 in order.",
      )
    : null;
}

/** Return the requirements missing from a design-system.md (empty = valid). */
export function validateDesignSystem(content: string): string[] {
  const missing: string[] = [];
  if (!content.includes("## Design Reference")) missing.push("## Design Reference section");
  if (!/https?:\/\//.test(content)) missing.push("reference URL (https://…)");
  if (!OKLCH_RE.test(content)) missing.push("oklch() color with chroma > 0");
  if (FORBIDDEN_FONTS.some((f) => content.includes(f))) missing.push("forbidden font (Inter/Roboto/Arial/Open Sans)");
  return missing;
}

/** Gate a screenshot: require a scroll since the last navigate (lazy-load content). */
export function screenshotScrollGate(state: DesignState): Prompt | null {
  return state.scrolledSinceNav
    ? null
    : deny("BLOCKED: scroll the page before a screenshot — browser_scroll to:'end', wait, scroll back, then fullPage screenshot.");
}

/** The Gemini design gates are OPT-IN: off unless `FUSE_DESIGN_GEMINI` is `1`/`true`. */
export function geminiEnabled(): boolean {
  const v = process.env.FUSE_DESIGN_GEMINI;
  return v === "1" || v === "true";
}
