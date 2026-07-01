import type { Prompt } from "../prompt/types";
import type { NormalizedEvent } from "./normalize";
import { loadDesignState, saveDesignState, initDesignState } from "../policy/design/state";
import { recordValidDesignSystem } from "../policy/design/transitions";
import { activeDesignAgent } from "../policy/design/flag";
import { runDesignChecks } from "../policy/design/content-checks";
import { uiDesignSkillGate } from "../policy/design/skill-gate";
import { collectDesignEvidence } from "../policy/design/skill-evidence";
import { findDesignSystem, recordPost } from "./design-helpers";
import {
  htmlCssOnlyGate, stateFileGate, screenshotScrollGate, validateDesignSystem,
  geminiEnabled, preScreenshotWriteGate,
} from "../policy/design/gates";
import { designSystemWriteGate, geminiCreateGate, browserNavigateGate } from "../policy/design/gates-pipeline";

const NAV = "mcp__fuse-browser__browser_navigate";
const SHOT = "mcp__fuse-browser__browser_screenshot";
const GEMINI = "mcp__gemini-design__create_frontend";

/**
 * Design-pipeline gate (effectful: reads/writes the design state + design-system.md).
 * Returns a Prompt to block, or null when this isn't a design-agent context / nothing fires.
 */
export function designGate(payload: Record<string, unknown>, event: NormalizedEvent, cacheDir: string, cwd: string): Prompt | null {
  // UI design-skill gate (ports check-design-skill.py): fires for ANY agent on a
  // UI write — requires a design-skill read + ANY doc source (Context7/Exa/web).
  // Gemini is NEVER required. Runs before the design-agent pipeline state logic.
  if (event.phase !== "post" && (event.tool === "Write" || event.tool === "Edit")) {
    const skillBlock = uiDesignSkillGate(event.tool, event.filePath ?? "", event.content ?? "", collectDesignEvidence(event.sessionId, cwd));
    if (skillBlock) return skillBlock;
  }

  const agentId = typeof payload.agent_id === "string" ? payload.agent_id : "";
  if (!agentId) return null; // top-level (lead) calls are never design-agent-scoped
  const active = activeDesignAgent(cacheDir);
  if (active && agentId !== active) return null;
  const id = agentId;
  // P5 fail-open fix: when the design flag is active but the state file is missing
  // (e.g. teammate context), auto-init a fresh state instead of disabling all
  // gating (parity with pipeline-gate.py:38-60). Without the flag, stay inert.
  let state = loadDesignState(cacheDir, id);
  if (!state) {
    if (!active) return null;
    const dsExists = findDesignSystem(cwd) !== "";
    state = initDesignState(id, dsExists ? "page" : "full", dsExists);
    saveDesignState(cacheDir, state);
  }

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
    const base = stateFileGate(fp) ?? htmlCssOnlyGate(fp) ?? preScreenshotWriteGate(fp, state) ?? designSystemWriteGate(fp, state);
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
