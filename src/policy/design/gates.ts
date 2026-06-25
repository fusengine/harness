import type { Prompt } from "../../prompt/types";
import { type DesignState, MIN_SCREENSHOTS } from "./state";

const ALLOWED_WRITE = /\.(html|css|md|json)$/;
const EXEMPT_DIRS: readonly string[] = ["node_modules/", "dist/", "build/", ".claude/"];
const FORBIDDEN_FONTS: readonly string[] = ["Inter", "Roboto", "Arial", "Open Sans"];
const OKLCH_RE = /oklch\(\s*[\d.]+%?\s+0\.0*[1-9]/;
const KNOWN_DOMAINS: readonly string[] = [
  "framer.website", "webflow.io", "awwwards.com", "godly.website", "lapa.ninja",
  "onepagelove.com", "saasframe.io", "bestwebsite.gallery", "landingfolio.com",
];

const deny = (reason: string): Prompt => ({
  kind: "block", title: "Design pipeline", reason,
  actions: ["Follow the design pipeline phases (0→identity, 1→inspiration, 2→screenshots, 3→design-system, 4→generate) in order"],
});

/** Block the design agent from writing anything but .html/.css/.md/.json. */
export function htmlCssOnlyGate(filePath: string): Prompt | null {
  if (EXEMPT_DIRS.some((d) => filePath.includes(d)) || ALLOWED_WRITE.test(filePath)) return null;
  return deny("BLOCKED: design-expert can only write .html, .css, .md, and .json files.");
}

/** Block edits to the harness-managed `.design-state-*` files (read-only to the agent). */
export function stateFileGate(filePath: string): Prompt | null {
  return filePath.includes(".design-state-")
    ? deny("BLOCKED: .design-state files are read-only; the hooks update them as you progress.")
    : null;
}

/** Gate writing design-system.md: requires phase ≥ 2 and the per-mode screenshot quota. */
export function designSystemWriteGate(filePath: string, state: DesignState): Prompt | null {
  if (!filePath.endsWith("design-system.md")) return null;
  if (state.currentPhase < 2) {
    return deny(`BLOCKED: cannot write design-system.md at phase ${state.currentPhase}. Read identity + inspiration, then browse & screenshot first.`);
  }
  const needed = MIN_SCREENSHOTS[state.mode];
  if (state.screenshotsCount < needed) {
    return deny(`BLOCKED: ${state.screenshotsCount}/${needed} fuse-browser screenshots for mode '${state.mode}'. Take ${needed - state.screenshotsCount} more (fullPage).`);
  }
  return null;
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

/** Gate Gemini create_frontend: requires phase ≥ 3 and a validated design system. */
export function geminiCreateGate(state: DesignState): Prompt | null {
  if (state.currentPhase < 3) return deny("BLOCKED: cannot call create_frontend before phase 3. Finish screenshots and write a valid design-system.md.");
  if (!state.designSystemValid) return deny("BLOCKED: design-system.md not validated (needs ## Design Reference, OKLCH, typography, reference URL).");
  return null;
}

/** Gate fuse-browser navigate: phase ≥ 1, inspiration read, URL in the catalog. */
export function browserNavigateGate(state: DesignState, url: string): Prompt | null {
  if (state.currentPhase < 1) return deny("BLOCKED: read identity templates + design-inspiration.md before browsing.");
  if (!state.inspirationRead) return deny("BLOCKED: design-inspiration.md not read yet — read it then pick catalog URLs.");
  if (url && !KNOWN_DOMAINS.some((d) => url.includes(d))) return deny(`BLOCKED: '${url}' is not in the catalog. Use design-inspiration-urls.md domains.`);
  return null;
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
