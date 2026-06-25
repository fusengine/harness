import type { DesignState, DesignMode } from "./state";

/** Infer the pipeline mode from the launch prompt + whether a design-system.md already exists. */
export function detectMode(prompt: string, designSystemExists: boolean): DesignMode {
  const p = prompt.toLowerCase();
  if (["component", "composant", "snippet"].some((k) => p.includes(k))) return "component";
  return designSystemExists ? "page" : "full";
}

/** Record a screenshot: bump the count and advance to phase 2 once the quota is met. */
export function recordScreenshot(state: DesignState, needed: number): DesignState {
  const screenshotsCount = state.screenshotsCount + 1;
  const next: DesignState = { ...state, screenshotsCount };
  if (screenshotsCount >= needed && state.currentPhase < 2) {
    next.currentPhase = 2;
    next.phasesCompleted = [...new Set([...state.phasesCompleted, "identity", "research"])];
  }
  return next;
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
 * Record a skill-file Read: reading the identity templates enters phase 1 (browsing
 * allowed); reading the inspiration catalog satisfies the browse prerequisite.
 */
export function recordRead(state: DesignState, filePath: string): DesignState {
  const next: DesignState = { ...state };
  if (filePath.includes("identity-system")) {
    next.currentPhase = Math.max(state.currentPhase, 1);
    next.phasesCompleted = [...new Set([...state.phasesCompleted, "identity"])];
  }
  if (filePath.includes("design-inspiration")) next.inspirationRead = true;
  return next;
}
