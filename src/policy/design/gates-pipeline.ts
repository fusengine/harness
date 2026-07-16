import type { Prompt } from "../../prompt/types";
import { type DesignState, MIN_SCREENSHOTS } from "./state";
import { PLUGINS_DIR } from "../file-size";
import { deny } from "./gates";

const SKILLS = `${PLUGINS_DIR}/design-expert/skills`;

const KNOWN_DOMAINS: readonly string[] = [
  "framer.website", "webflow.io", "awwwards.com", "godly.website", "lapa.ninja",
  "onepagelove.com", "saasframe.io", "bestwebsite.gallery", "landingfolio.com",
];

/** Gate writing design-system.md: requires phase >= 2 and the per-mode screenshot quota. */
export function designSystemWriteGate(filePath: string, state: DesignState): Prompt | null {
  if (!filePath.endsWith("design-system.md")) return null;
  if (state.currentPhase < 2) {
    return deny(
      `BLOCKED: Cannot write design-system.md at phase ${state.currentPhase}. ` +
        "RECOVERY: 1) Read identity templates from skills/design-system/ " +
        "2) Read design-inspiration.md 3) Browse and screenshot sites 4) Then write design-system.md",
    );
  }
  const needed = MIN_SCREENSHOTS[state.mode];
  if (state.screenshotsCount < needed) {
    return deny(
      `BLOCKED: ${state.screenshotsCount}/${needed} screenshots for mode '${state.mode}'. ` +
        `RECOVERY: 1) Take ${needed - state.screenshotsCount} more fuse-browser screenshots ` +
        "2) Use browser_open + browser_navigate + browser_screenshot fullPage:true 3) Then write design-system.md",
    );
  }
  return null;
}

/** Gate Gemini create_frontend: requires phase >= 3 and a validated design system. */
export function geminiCreateGate(state: DesignState): Prompt | null {
  if (state.currentPhase < 3) {
    return deny(
      "BLOCKED: Cannot call Gemini create_frontend before phase 3. " +
        "RECOVERY: 1) Complete screenshot browsing phase 2) Write a valid design-system.md " +
        "3) Then call mcp__gemini-design__create_frontend",
    );
  }
  if (!state.designSystemValid) {
    return deny(
      "BLOCKED: design-system.md not validated. " +
        "RECOVERY: 1) Ensure design-system.md has ## Design Reference, OKLCH tokens, typography pair, reference URL " +
        "2) Then retry mcp__gemini-design__create_frontend",
    );
  }
  return null;
}

/** Gate fuse-browser navigate: phase >= 1, inspiration read, URL in the catalog. */
export function browserNavigateGate(state: DesignState, url: string): Prompt | null {
  if (state.currentPhase < 1) {
    return deny(`BLOCKED: Phase 0 not done. READ: ${SKILLS}/design-system/SKILL.md first.`);
  }
  if (!state.inspirationRead) {
    return deny(
      `BLOCKED: Read inspiration catalog first. READ: ${SKILLS}/design-web/references/design-inspiration.md + design-inspiration-urls.md`,
    );
  }
  if (state.currentPhase === 1 && url && !KNOWN_DOMAINS.some((d) => url.includes(d))) {
    return deny(`BLOCKED: '${url}' not in catalog. Use URLs from design-inspiration-urls.md. Domains: ${KNOWN_DOMAINS.join(", ")}`);
  }
  return null;
}
