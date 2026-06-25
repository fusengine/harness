import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Prompt } from "../prompt/types";
import type { NormalizedEvent } from "./normalize";
import { type DesignState, loadDesignState, saveDesignState, MIN_SCREENSHOTS } from "../policy/design/state";
import { recordScreenshot, recordNavigate, recordScroll, recordValidDesignSystem, recordRead } from "../policy/design/transitions";
import { activeDesignAgent } from "../policy/design/flag";
import { runDesignChecks } from "../policy/design/content-checks";
import {
  htmlCssOnlyGate, stateFileGate, designSystemWriteGate, geminiCreateGate,
  browserNavigateGate, screenshotScrollGate, validateDesignSystem, geminiEnabled,
} from "../policy/design/gates";

const NAV = "mcp__fuse-browser__browser_navigate";
const SHOT = "mcp__fuse-browser__browser_screenshot";
const SCROLL = "mcp__fuse-browser__browser_scroll";
const GEMINI = "mcp__gemini-design__create_frontend";

/** Read design-system.md walking up to 6 parents from `cwd` ("" if absent/unreadable). */
function findDesignSystem(cwd: string): string {
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
function recordPost(event: NormalizedEvent, cacheDir: string, state: DesignState): void {
  if (event.tool === SHOT) saveDesignState(cacheDir, recordScreenshot(state, MIN_SCREENSHOTS[state.mode]));
  else if (event.tool === NAV) saveDesignState(cacheDir, recordNavigate(state));
  else if (event.tool === SCROLL) saveDesignState(cacheDir, recordScroll(state));
  else if (event.tool === GEMINI) saveDesignState(cacheDir, { ...state, geminiCalls: state.geminiCalls + 1 });
  else if (event.tool === "Read") saveDesignState(cacheDir, recordRead(state, event.filePath ?? ""));
  else if ((event.tool === "Write" || event.tool === "Edit") && (event.filePath ?? "").endsWith("design-system.md")) {
    saveDesignState(cacheDir, recordValidDesignSystem(state));
  }
}

/**
 * Design-pipeline gate (effectful: reads/writes the design state + design-system.md).
 * Returns a Prompt to block, or null when this isn't a design-agent context / nothing fires.
 */
export function designGate(payload: Record<string, unknown>, event: NormalizedEvent, cacheDir: string, cwd: string): Prompt | null {
  const agentId = typeof payload.agent_id === "string" ? payload.agent_id : "";
  const active = activeDesignAgent(cacheDir);
  if (active && agentId && agentId !== active) return null;
  const id = active || agentId;
  if (!id) return null;
  const state = loadDesignState(cacheDir, id);
  if (!state) return null;

  if (event.phase === "post") {
    recordPost(event, cacheDir, state);
    if ((event.tool === "Write" || event.tool === "Edit") && /\.(tsx|jsx|css)$/.test(event.filePath ?? "")) {
      const warnings = runDesignChecks(event.content ?? "");
      if (warnings.length) return { kind: "inform", title: "Design review", reason: warnings.join(" "), actions: [] };
    }
    return null;
  }
  if (event.tool === "Write" || event.tool === "Edit") {
    const fp = event.filePath ?? "";
    const base = stateFileGate(fp) ?? htmlCssOnlyGate(fp) ?? designSystemWriteGate(fp, state);
    if (base) return base;
    if (geminiEnabled() && state.geminiCalls === 0 && /\.(html|css)$/.test(fp)) {
      return { kind: "block", title: "Design pipeline", reason: "BLOCKED: generate the frontend via create_frontend before hand-writing HTML/CSS.", actions: ["Call mcp__gemini-design__create_frontend first"] };
    }
    return null;
  }
  if (event.tool === NAV) {
    return browserNavigateGate(state, typeof event.input.url === "string" ? event.input.url : "");
  }
  if (event.tool === SHOT) return screenshotScrollGate(state);
  if (event.tool === GEMINI) {
    if (!geminiEnabled()) return null;
    const block = geminiCreateGate(state);
    if (block) return block;
    const missing = validateDesignSystem(findDesignSystem(cwd));
    if (missing.length) {
      return { kind: "block", title: "Design pipeline", reason: `BLOCKED: design-system.md too generic. Missing: ${missing.join(", ")}.`, actions: ["Fix design-system.md, then retry create_frontend"] };
    }
    saveDesignState(cacheDir, recordValidDesignSystem(state));
  }
  return null;
}
