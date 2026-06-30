/**
 * @module design-helpers
 * Effectful helpers for the design pipeline gate: locate design-system.md and
 * apply PostToolUse fuse-browser transitions to the design state. Split out of
 * `design.ts` to keep that file within the SOLID size budget (SRP).
 * @packageDocumentation
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { NormalizedEvent } from "./normalize";
import { type DesignState, saveDesignState, MIN_SCREENSHOTS } from "../policy/design/state";
import { recordScreenshot, recordNavigate, recordScroll, recordValidDesignSystem, recordRead } from "../policy/design/transitions";

const NAV = "mcp__fuse-browser__browser_navigate";
const SHOT = "mcp__fuse-browser__browser_screenshot";
const SCROLL = "mcp__fuse-browser__browser_scroll";
const GEMINI = "mcp__gemini-design__create_frontend";

/** Read design-system.md walking up to 6 parents from `cwd` ("" if absent/unreadable). */
export function findDesignSystem(cwd: string): string {
  let dir = cwd;
  for (let i = 0; i < 6; i++) {
    const p = join(dir, "design-system.md");
    if (existsSync(p)) {
      try {
        return readFileSync(p, "utf8");
      } catch {
        return "";
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "";
}

/** Apply a PostToolUse fuse-browser transition to the design state. */
export function recordPost(event: NormalizedEvent, cacheDir: string, state: DesignState): void {
  if (event.tool === SHOT) saveDesignState(cacheDir, recordScreenshot(state, MIN_SCREENSHOTS[state.mode]));
  else if (event.tool === NAV) saveDesignState(cacheDir, recordNavigate(state));
  else if (event.tool === SCROLL) saveDesignState(cacheDir, recordScroll(state));
  else if (event.tool === GEMINI) saveDesignState(cacheDir, { ...state, geminiCalls: state.geminiCalls + 1 });
  else if (event.tool === "Read") saveDesignState(cacheDir, recordRead(state, event.filePath ?? ""));
  else if ((event.tool === "Write" || event.tool === "Edit") && (event.filePath ?? "").endsWith("design-system.md")) {
    saveDesignState(cacheDir, recordValidDesignSystem(state));
  }
}
