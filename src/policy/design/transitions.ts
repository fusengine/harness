import { type DesignState, type DesignMode, quotaFor } from "./state";
import { corpusReady } from "./corpus";

/** Infer the pipeline mode from the launch prompt + whether a design-system.md already exists. */
export function detectMode(prompt: string, designSystemExists: boolean): DesignMode {
  const p = prompt.toLowerCase();
  if (["component", "composant", "snippet"].some((k) => p.includes(k))) return "component";
  return designSystemExists ? "page" : "full";
}

/**
 * Re-evaluate the phase-2 conjunction MONOTONICALLY: corpus reads (when the
 * corpus is delivered) AND the screenshot quota must both hold, and the phase
 * is never written downwards (a Read after phase 3 changes nothing).
 */
function maybePhase2(state: DesignState, corpusRequired: boolean): DesignState {
  if (state.currentPhase >= 2) return state;
  const corpusOk = !corpusRequired || corpusReady(state.corpusReads, state.mode);
  if (!corpusOk || state.screenshotsCount < quotaFor(state.mode, corpusRequired)) return state;
  return { ...state, currentPhase: 2, phasesCompleted: [...new Set([...state.phasesCompleted, "identity", "research"])] };
}

/** Record a screenshot: bump the count, then re-evaluate the phase-2 conjunction. */
export function recordScreenshot(state: DesignState, corpusRequired: boolean): DesignState {
  return maybePhase2({ ...state, screenshotsCount: state.screenshotsCount + 1 }, corpusRequired);
}

/** Record a fuse-browser navigate (resets the scroll-before-screenshot guard). */
export function recordNavigate(state: DesignState): DesignState {
  return { ...state, scrolledSinceNav: false };
}

/** Record a fuse-browser scroll (satisfies the scroll-before-screenshot guard). */
export function recordScroll(state: DesignState): DesignState {
  return { ...state, scrolledSinceNav: true };
}

/** Mark the design system validated and advance to phase 3 (after a passing create_frontend check). */
export function recordValidDesignSystem(state: DesignState): DesignState {
  return {
    ...state, designSystemExists: true, designSystemValid: true,
    currentPhase: Math.max(state.currentPhase, 3),
    phasesCompleted: [...new Set([...state.phasesCompleted, "design-system"])],
  };
}

/**
 * Record a corpus read: distinct files only (a re-read never inflates the
 * list), then re-evaluate the phase-2 conjunction. `relPath` is relative to
 * the corpus root, keeping the persisted state small and prefix-independent.
 */
export function recordCorpusRead(state: DesignState, relPath: string, corpusRequired: boolean): DesignState {
  return maybePhase2({ ...state, corpusReads: [...new Set([...state.corpusReads, relPath])] }, corpusRequired);
}

/**
 * Record a skill-file Read: reading the identity templates enters phase 1 (browsing
 * allowed); reading the inspiration catalog satisfies the browse prerequisite.
 */
export function recordRead(state: DesignState, filePath: string, corpusRequired = false): DesignState {
  const next: DesignState = { ...state };
  if (filePath.includes("design-system/SKILL.md")) {
    next.currentPhase = Math.max(state.currentPhase, 1);
    next.phasesCompleted = [...new Set([...state.phasesCompleted, "identity"])];
  }
  if (filePath.includes("design-inspiration")) next.inspirationRead = true;
  return maybePhase2(next, corpusRequired);
}
