import { existsSync, readFileSync, renameSync, readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { atomicWrite } from "../../util/json-io";

/** Pipeline mode — drives the screenshot quota and phase expectations. */
export type DesignMode = "full" | "page" | "component";

/** The design-agent pipeline state-machine snapshot (phases 0→4). */
export interface DesignState {
  agentId: string;
  mode: DesignMode;
  currentPhase: number;
  phasesCompleted: string[];
  inspirationRead: boolean;
  scrolledSinceNav: boolean;
  screenshotsCount: number;
  designSystemExists: boolean;
  designSystemValid: boolean;
  geminiCalls: number;
}

/** Minimum fuse-browser screenshots required before writing design-system.md, per mode. */
export const MIN_SCREENSHOTS: Readonly<Record<DesignMode, number>> = { full: 4, page: 2, component: 0 };

const stateFile = (cacheDir: string, agentId: string): string => join(cacheDir, `.design-state-${agentId}.json`);

/** Load the design state for `agentId`, or null when absent/corrupt (fail-open). */
export function loadDesignState(cacheDir: string, agentId: string): DesignState | null {
  const path = stateFile(cacheDir, agentId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as DesignState;
  } catch {
    return null;
  }
}

/** Persist the design state under its agent id. */
export function saveDesignState(cacheDir: string, state: DesignState): void {
  atomicWrite(stateFile(cacheDir, state.agentId), JSON.stringify(state, null, 2));
}

/** Build the initial state for a design agent starting a run. */
export function initDesignState(agentId: string, mode: DesignMode, designSystemExists: boolean): DesignState {
  return {
    agentId, mode, currentPhase: 0, phasesCompleted: [], inspirationRead: false,
    scrolledSinceNav: false, screenshotsCount: 0, designSystemExists, designSystemValid: false, geminiCalls: 0,
  };
}

/** Archive the active state file (timestamp suffix) and drop archives older than 7 days. */
export function cleanupDesignStates(cacheDir: string, agentId: string, stamp: string, now: number): void {
  if (agentId) {
    const src = stateFile(cacheDir, agentId);
    if (existsSync(src)) renameSync(src, join(cacheDir, `.design-state-${agentId}-${stamp}.json`));
  }
  let entries: string[];
  try {
    entries = readdirSync(cacheDir);
  } catch {
    return;
  }
  const cutoff = now - 7 * 86_400_000;
  for (const name of entries) {
    if (!name.startsWith(".design-state-")) continue;
    const path = join(cacheDir, name);
    try {
      if (statSync(path).mtimeMs < cutoff) rmSync(path);
    } catch {
      /* ignore unlink races */
    }
  }
}
