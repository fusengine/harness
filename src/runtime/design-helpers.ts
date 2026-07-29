/**
 * @module design-helpers
 * Effectful helpers for the design pipeline gate: locate design-system.md and
 * apply PostToolUse fuse-browser transitions to the design state. Split out of
 * `design.ts` to keep that file within the SOLID size budget (SRP).
 * @packageDocumentation
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type { NormalizedEvent } from "./normalize";
import { type DesignState, saveDesignState } from "../policy/design/state";
import { recordScreenshot, recordCorpusRead, recordNavigate, recordScroll, recordValidDesignSystem, recordRead } from "../policy/design/transitions";
import { classifyCorpusRead } from "../policy/design/corpus";
import { designSystemProblems } from "./design-content-gate";
import { substituteLiteral } from "./design-files-gate";

export { designSystemContentGate } from "./design-content-gate";

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
export function recordPost(event: NormalizedEvent, cacheDir: string, state: DesignState, corpusRoot = "", corpusRequired = false, cwd = ""): void {
  if (event.tool === SHOT) saveDesignState(cacheDir, recordScreenshot(state, corpusRequired));
  else if (event.tool === NAV) saveDesignState(cacheDir, recordNavigate(state));
  else if (event.tool === SCROLL) saveDesignState(cacheDir, recordScroll(state));
  else if (event.tool === GEMINI) saveDesignState(cacheDir, { ...state, geminiCalls: state.geminiCalls + 1 });
  else if (event.tool === "Read") {
    const fp = event.filePath ?? "";
    // A corpus read counts only when anchored under the delivered root AND the
    // file exists (no tool_response reaches this hook — existsSync compensates).
    if (classifyCorpusRead(fp, corpusRoot) && existsSync(fp)) {
      saveDesignState(cacheDir, recordCorpusRead(state, fp.slice(corpusRoot.length + 1), corpusRequired));
    } else saveDesignState(cacheDir, recordRead(state, fp, corpusRequired));
  } else if ((event.tool === "Write" || event.tool === "Edit") && (event.filePath ?? "").endsWith("design-system.md")) {
    // Write access ≠ validity, same rule both sides: POST validates only a
    // zero-problem content and DEGRADES only what PRE would have blocked.
    const fp = event.filePath ?? "";
    let content: string;
    try {
      content = readFileSync(fp, "utf8");
    } catch {
      return;
    }
    const problems = designSystemProblems(content, state.corpusReads, corpusRequired);
    if (!problems.length) {
      saveDesignState(cacheDir, recordValidDesignSystem(state));
      return;
    }
    // Edit: degrade only on problems the edit INTRODUCED (original reverse-rebuilt
    // with LITERAL substitution; a deletion edit is not reconstructable — D5).
    if (event.tool === "Edit" && event.oldString && event.content && content.includes(event.content)) {
      const original = substituteLiteral(content, event.content, event.oldString, event.input.replace_all === true);
      const introduced = problems.filter((p) => !designSystemProblems(original, state.corpusReads, corpusRequired).includes(p));
      if (introduced.length) saveDesignState(cacheDir, { ...state, designSystemValid: false });
    }
    // Write / unreconstructable Edit: the PRE gate enforced not-worsening — never degrade here.
  } else if (event.files) {
    // Codex apply_patch: PROMOTE-ONLY, never blocking nor degrading — the POST
    // re-reads the REAL file (the hunk is never the document): clean → phase 3,
    // dirty → nothing. designSystemValid is only consumed under FUSE_DESIGN_GEMINI.
    const ds = event.files.find((f) => f.op !== "delete" && f.filePath.endsWith("design-system.md"));
    if (ds) {
      const abs = isAbsolute(ds.filePath) ? ds.filePath : join(cwd, ds.filePath);
      let content: string;
      try {
        content = readFileSync(abs, "utf8");
      } catch {
        return;
      }
      if (!designSystemProblems(content, state.corpusReads, corpusRequired).length) {
        saveDesignState(cacheDir, recordValidDesignSystem(state));
      }
    }
  }
}
