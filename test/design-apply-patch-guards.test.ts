import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeEvent } from "../src/runtime/normalize";
import { designGate } from "../src/runtime/design";
import { handlePost } from "../src/runtime/handle-post";
import { defaultStateDir, trackFile } from "../src/runtime/paths";
import { setActiveDesignAgent } from "../src/policy/design/flag";
import { loadDesignState, saveDesignState, initDesignState } from "../src/policy/design/state";
import type { DesignState } from "../src/policy/design/state";
import type { NormalizedEvent } from "../src/runtime/normalize";
import type { PreContext } from "../src/runtime/handle-pre";

/**
 * Non-regression matrix for the D2 htmlCssOnlyGate parity fix in the PRE path
 * (Write/Edit vs apply_patch, `designFilesGate`), plus two POST regression
 * witnesses proving the RAW-envelope wiring through the REAL `handlePost()`
 * call site — never a hand-rolled `designGate` call, which proves nothing
 * about how `handle-post.ts` itself wires the event (see its module doc and
 * MEMORY/LESSON.md's fan-out regression entry). Mirrors the real chain used
 * by `test/design-apply-patch.test.ts` — no mocking.
 */
const URL_DS = "## Design Reference\nInspiration: https://boulangerie-dupont.fr\n--a: oklch(0.62 0.19 250);\n--font: \"Fraunces\";";
const tmp = (): string => mkdtempSync(join(tmpdir(), "fh-apg-"));
const TSX = "export default function Foo(){ return null; }";
const activate = (cache: string): void => {
  setActiveDesignAgent(cache, "ag");
  saveDesignState(cache, initDesignState("ag", "full", false));
};
const patchAdd = (path: string, body: string): string => `*** Begin Patch\n*** Add File: ${path}\n+${body}\n*** End Patch`;
const apEv = (phase: string, patch: string, agentId?: string) =>
  normalizeEvent("codex", { hook_event_name: phase === "pre" ? "PreToolUse" : "PostToolUse", tool_name: "apply_patch", tool_input: { command: patch }, session_id: "s", ...(agentId ? { agent_id: agentId } : {}) });

/**
 * D-html-css-pipeline-gate: a design-system.md validated in BOTH state
 * (phase 3 + designSystemValid) AND on disk — the ONLY combination
 * `htmlCssPipelineGate` (gates-pipeline.ts) allows a .html/.css write through.
 * `activateReady` writes the real file (findDesignSystem reads disk, never state).
 */
const activateReady = (cache: string, proj: string, agentId = "ag"): void => {
  setActiveDesignAgent(cache, agentId);
  const state: DesignState = { ...initDesignState(agentId, "page", true), currentPhase: 3, designSystemValid: true, designSystemExists: true };
  saveDesignState(cache, state);
  writeFileSync(join(proj, "design-system.md"), URL_DS);
};

test("Write .tsx -> DENY", () => {
  const cache = tmp(), proj = tmp();
  activate(cache);
  const ev = normalizeEvent("claude-code", { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: join(proj, "Foo.tsx"), content: TSX }, session_id: "s", agent_id: "ag" });
  expect(designGate({ agent_id: "ag" }, ev, cache, proj, "")?.kind).toBe("block");
});
test("Edit .tsx -> DENY", () => {
  const cache = tmp(), proj = tmp();
  activate(cache);
  const ev = normalizeEvent("claude-code", { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: join(proj, "Foo.tsx"), old_string: "null", new_string: "undefined" }, session_id: "s", agent_id: "ag" });
  expect(designGate({ agent_id: "ag" }, ev, cache, proj, "")?.kind).toBe("block");
});
// D-html-css-pipeline-gate (the fix, test/design-html-css-pipeline-gate.test.ts
// owns the full DENY/ALLOW/parity matrix): was "Write .html -> ALLOW" unconditionally
// at any phase — the exact gap the owner reported. Setup moved to a validated
// design-system (phase 3 + on disk) so this assertion stays true post-fix.
test("Write .html, design-system validated (phase 3 + on disk) -> ALLOW", () => {
  const cache = tmp(), proj = tmp();
  activateReady(cache, proj);
  const ev = normalizeEvent("claude-code", { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: join(proj, "index.html"), content: "<html></html>" }, session_id: "s", agent_id: "ag" });
  expect(designGate({ agent_id: "ag" }, ev, cache, proj, "")).toBeNull();
});
test("apply_patch add .tsx -> DENY (the fix: htmlCssOnlyGate now runs in designFilesGate)", () => {
  const cache = tmp(), proj = tmp();
  activate(cache);
  const ev = apEv("pre", patchAdd(join(proj, "Foo.tsx"), TSX), "ag");
  expect(designGate({ agent_id: "ag" }, ev, cache, proj, "")?.kind).toBe("block");
});
test("apply_patch add .html in phase 0, Gemini precondition ON, no create_frontend call yet -> DENY (the fix: Gemini precondition now runs in designFilesGate; this case was ALLOW before)", () => {
  const cache = tmp(), proj = tmp();
  activate(cache);
  const prev = process.env.FUSE_DESIGN_GEMINI;
  process.env.FUSE_DESIGN_GEMINI = "1";
  try {
    const ev = apEv("pre", patchAdd(join(proj, "index.html"), "<html></html>"), "ag");
    expect(designGate({ agent_id: "ag" }, ev, cache, proj, "")?.kind).toBe("block");
  } finally {
    if (prev === undefined) delete process.env.FUSE_DESIGN_GEMINI;
    else process.env.FUSE_DESIGN_GEMINI = prev;
  }
});
// D-html-css-pipeline-gate: both tests below require the design-system to also
// be validated now (previously ALLOW at any phase — the gap the fix closes).
test("apply_patch add .html, Gemini precondition ON but create_frontend already called (geminiCalls > 0), design-system validated -> ALLOW (not over-blocking)", () => {
  const cache = tmp(), proj = tmp();
  activateReady(cache, proj);
  saveDesignState(cache, { ...loadDesignState(cache, "ag")!, geminiCalls: 1 });
  const prev = process.env.FUSE_DESIGN_GEMINI;
  process.env.FUSE_DESIGN_GEMINI = "1";
  try {
    const ev = apEv("pre", patchAdd(join(proj, "index.html"), "<html></html>"), "ag");
    expect(designGate({ agent_id: "ag" }, ev, cache, proj, "")).toBeNull();
  } finally {
    if (prev === undefined) delete process.env.FUSE_DESIGN_GEMINI;
    else process.env.FUSE_DESIGN_GEMINI = prev;
  }
});
test("apply_patch add .html, Gemini precondition OFF (default), design-system validated -> ALLOW (unchanged default behavior)", () => {
  const cache = tmp(), proj = tmp();
  activateReady(cache, proj);
  const ev = apEv("pre", patchAdd(join(proj, "index.html"), "<html></html>"), "ag");
  expect(designGate({ agent_id: "ag" }, ev, cache, proj, "")).toBeNull();
});
test("apply_patch by a NON-design agent (active design agent is someone else) -> ALLOW", () => {
  const cache = tmp(), proj = tmp();
  setActiveDesignAgent(cache, "someone-else");
  const ev = apEv("pre", patchAdd(join(proj, "Foo.tsx"), TSX), "ag");
  expect(designGate({ agent_id: "ag" }, ev, cache, proj, "")).toBeNull();
});
test("apply_patch with no agent_id at all (top-level/lead call) -> ALLOW", () => {
  const cache = tmp(), proj = tmp();
  const ev = apEv("pre", patchAdd(join(proj, "Foo.tsx"), TSX));
  expect(designGate({}, ev, cache, proj, "")).toBeNull();
});
test("apply_patch by a NON-design agent on a UI-path file -> same verdict as the equivalent Write (parity proof that uiDesignSkillGate's placement in design.ts covers apply_patch for ANY agent, not just design agents)", () => {
  const cache = tmp(), proj = tmp();
  setActiveDesignAgent(cache, "someone-else"); // "ag" is NOT the active design agent
  const uiPath = join(proj, "components", "Foo.tsx");
  const evWrite = normalizeEvent("claude-code", { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: uiPath, content: TSX }, session_id: "s", agent_id: "ag" });
  const evPatch = apEv("pre", patchAdd(uiPath, TSX), "ag");
  const writeVerdict = designGate({ agent_id: "ag" }, evWrite, cache, proj, "");
  const patchVerdict = designGate({ agent_id: "ag" }, evPatch, cache, proj, "");
  expect(writeVerdict?.kind).toBe("block");
  expect(patchVerdict?.kind).toBe("block");
  expect(patchVerdict?.reason).toBe(writeVerdict?.reason);
});
test("apply_patch multi-file: only the 2nd file violates uiDesignSkillGate (UI-path .tsx, no skill evidence) -> the WHOLE envelope is blocked", () => {
  const cache = tmp(), proj = tmp();
  activate(cache);
  const patch = `*** Begin Patch\n*** Add File: ${join(proj, "notes.md")}\n+hello\n*** Add File: ${join(proj, "components", "Bad.tsx")}\n+${TSX}\n*** End Patch`;
  const ev = apEv("pre", patch, "ag");
  const v = designGate({ agent_id: "ag" }, ev, cache, proj, "");
  expect(v?.kind).toBe("block");
  expect(v?.title).toBe("Design skill");
});
test("apply_patch multi-file: only the 2nd file violates -> the WHOLE envelope is blocked", () => {
  const cache = tmp(), proj = tmp();
  activate(cache);
  const patch = `*** Begin Patch\n*** Add File: ${join(proj, "ok.css")}\n+div { color: red; }\n*** Add File: ${join(proj, "Bad.tsx")}\n+${TSX}\n*** End Patch`;
  const ev = apEv("pre", patch, "ag");
  expect(designGate({ agent_id: "ag" }, ev, cache, proj, "")?.kind).toBe("block");
});

// --- Regression witnesses: POST apply_patch, RELATIVE design-system.md path,
// must promote via promote-only + join(cwd, …) (design-helpers.ts:79-95) —
// through the REAL `handlePost()` call site (`src/runtime/handle-post.ts:48`),
// never a hand-rolled `designGate` call: a direct call proves nothing about
// how `handle-post.ts` itself wires the raw event vs. a fanned one, which is
// exactly the reverted regression (MEMORY/LESSON.md, 2026-08-02 22:20 entry).
// Falsifiability was verified manually (not re-encoded here): temporarily
// mutating handle-post.ts:48 to `designGate(payload, files[0] ?? event, ...)`
// made the first assertion below fail (currentPhase stayed 2, not 3); the
// mutation was reverted (git diff src/ clean) before landing this file.
const dsSetup = (): { cache: string; proj: string; patch: string } => {
  const cache = tmp(), proj = tmp();
  setActiveDesignAgent(cache, "ag");
  saveDesignState(cache, { ...initDesignState("ag", "full", false), currentPhase: 2, inspirationRead: true, screenshotsCount: 4 });
  writeFileSync(join(proj, "design-system.md"), URL_DS); // tool "already ran": real file on disk.
  const dsLines = URL_DS.split("\n").map((l) => `+${l}`).join("\n");
  return { cache, proj, patch: `*** Begin Patch\n*** Add File: design-system.md\n${dsLines}\n*** End Patch` };
};
/** Same PreContext shape handlePost receives in production (mirrors test/apply-patch-post.test.ts's ctxFor), pinned to the "ag" design agent, corpus waived. */
const postCtx = (cache: string, proj: string, event: NormalizedEvent): PreContext => ({
  id: "codex", payload: { agent_id: "ag" }, event, framework: "generic", mcpDir: cache,
  file: trackFile(event.sessionId, defaultStateDir(proj)), opts: { now: 1000, cwd: proj, scope: "rules", corpusRoot: "" },
});
test("POST apply_patch through handlePost(): RELATIVE design-system.md path promotes (real production call site, raw envelope)", async () => {
  const { cache, proj, patch } = dsSetup();
  const out = await handlePost(postCtx(cache, proj, apEv("post", patch, "ag")));
  expect(out.exit).toBe(0);
  const s = loadDesignState(cache, "ag")!;
  expect(s.currentPhase).toBe(3);
  expect(s.designSystemValid).toBe(true);
});
test("regression witness: handlePost() also surfaces the per-file pass notice for the promoted design-system.md", async () => {
  const { cache, proj, patch } = dsSetup();
  const out = await handlePost(postCtx(cache, proj, apEv("post", patch, "ag")));
  expect(out.exit).toBe(0);
  expect(out.stdout).toContain("design-system.md");
  const s = loadDesignState(cache, "ag")!;
  expect(s.currentPhase).toBe(3);
  expect(s.designSystemValid).toBe(true);
});
