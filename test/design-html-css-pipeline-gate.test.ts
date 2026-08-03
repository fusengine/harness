import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeEvent } from "../src/runtime/normalize";
import { designGate } from "../src/runtime/design";
import { setActiveDesignAgent } from "../src/policy/design/flag";
import { saveDesignState, initDesignState } from "../src/policy/design/state";
import type { DesignState } from "../src/policy/design/state";
import { htmlCssPipelineGate } from "../src/policy/design/gates-pipeline";

/**
 * Matrix for `htmlCssPipelineGate` (gates-pipeline.ts): writing a .html/.css
 * file in the design-agent context requires NO skill read (owner-scoped out
 * of `uiDesignSkillGate`/`UI_FILE_RE` — never touched here) but DOES require
 * the design-system pipeline complete: phase >= 3, `designSystemValid`, AND
 * the file present on disk. Covers PRE Write/Edit (`design.ts`) and PRE
 * apply_patch (`design-files-gate.ts`) with an explicit parity assertion —
 * the two write paths must render the SAME verdict for the SAME file+state.
 */
const URL_DS = "## Design Reference\nInspiration: https://boulangerie-dupont.fr\n--a: oklch(0.62 0.19 250);\n--font: \"Fraunces\";";
const tmp = (): string => mkdtempSync(join(tmpdir(), "fh-hcpg-"));
const TSX = "export default function Foo(){ return null; }";
const patchAdd = (path: string, body: string): string => `*** Begin Patch\n*** Add File: ${path}\n+${body}\n*** End Patch`;
const apEv = (patch: string, agentId?: string) =>
  normalizeEvent("codex", { hook_event_name: "PreToolUse", tool_name: "apply_patch", tool_input: { command: patch }, session_id: "s", ...(agentId ? { agent_id: agentId } : {}) });
const writeEv = (proj: string, filename: string, content: string) =>
  normalizeEvent("claude-code", { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: join(proj, filename), content }, session_id: "s", agent_id: "ag" });

/** Design agent at phase 0 — no design-system read, none on disk. Not yet ready. */
const activatePhase0 = (cache: string): void => {
  setActiveDesignAgent(cache, "ag");
  saveDesignState(cache, initDesignState("ag", "full", false));
};
/** Design agent with the design-system validated BOTH in state AND on disk — the only ALLOW combination. */
const activateReady = (cache: string, proj: string): void => {
  setActiveDesignAgent(cache, "ag");
  const state: DesignState = { ...initDesignState("ag", "page", true), currentPhase: 3, designSystemValid: true, designSystemExists: true };
  saveDesignState(cache, state);
  writeFileSync(join(proj, "design-system.md"), URL_DS);
};

test("1) design-agent, .html, phase 0 -> DENY (the fix)", () => {
  const cache = tmp(), proj = tmp();
  activatePhase0(cache);
  expect(designGate({ agent_id: "ag" }, writeEv(proj, "index.html", "<html></html>"), cache, proj, "")?.kind).toBe("block");
});
test("2) design-agent, .html, phase 3 + design-system validated -> ALLOW", () => {
  const cache = tmp(), proj = tmp();
  activateReady(cache, proj);
  expect(designGate({ agent_id: "ag" }, writeEv(proj, "index.html", "<html></html>"), cache, proj, "")).toBeNull();
});
test("3) design-agent, .css, phase 0 -> DENY; validated -> ALLOW", () => {
  const c1 = tmp(), p1 = tmp();
  activatePhase0(c1);
  expect(designGate({ agent_id: "ag" }, writeEv(p1, "style.css", "body{}"), c1, p1, "")?.kind).toBe("block");

  const c2 = tmp(), p2 = tmp();
  activateReady(c2, p2);
  expect(designGate({ agent_id: "ag" }, writeEv(p2, "style.css", "body{}"), c2, p2, "")).toBeNull();
});
test("4) PARITY: same .html via Write vs apply_patch -> identical verdict, at phase 0 and once validated", () => {
  const cD = tmp(), pD = tmp();
  activatePhase0(cD);
  const wD = designGate({ agent_id: "ag" }, writeEv(pD, "index.html", "<html></html>"), cD, pD, "");
  const aD = designGate({ agent_id: "ag" }, apEv(patchAdd(join(pD, "index.html"), "<html></html>"), "ag"), cD, pD, "");
  expect(wD?.kind).toBe("block");
  expect(aD?.kind).toBe("block");

  const cA = tmp(), pA = tmp();
  activateReady(cA, pA);
  const wA = designGate({ agent_id: "ag" }, writeEv(pA, "index.html", "<html></html>"), cA, pA, "");
  const aA = designGate({ agent_id: "ag" }, apEv(patchAdd(join(pA, "index.html"), "<html></html>"), "ag"), cA, pA, "");
  expect(wA).toBeNull();
  expect(aA).toBeNull();
});
test("5) NON-design agent, .html, phase 0 -> ALLOW (proof of no over-blocking)", () => {
  const cache = tmp(), proj = tmp();
  setActiveDesignAgent(cache, "someone-else"); // "ag" is NOT the active design agent
  expect(designGate({ agent_id: "ag" }, writeEv(proj, "index.html", "<html></html>"), cache, proj, "")).toBeNull();
});
test("6) design-agent, .md and .json, phase 0 -> unchanged (gate only matches .html/.css)", () => {
  const cache = tmp(), proj = tmp();
  activatePhase0(cache);
  expect(designGate({ agent_id: "ag" }, writeEv(proj, "notes.md", "hello"), cache, proj, "")).toBeNull();
  expect(designGate({ agent_id: "ag" }, writeEv(proj, "tokens.json", "{}"), cache, proj, "")).toBeNull();
});
test("7a) non-regression: .tsx still DENY (htmlCssOnlyGate, unrelated to this gate)", () => {
  const cache = tmp(), proj = tmp();
  activatePhase0(cache);
  expect(designGate({ agent_id: "ag" }, writeEv(proj, "Foo.tsx", TSX), cache, proj, "")?.kind).toBe("block");
});
test("7b) non-regression: design-system.md write still gated by designSystemWriteGate (phase >= 2), unaffected by the new gate", () => {
  const cache = tmp(), proj = tmp();
  activatePhase0(cache);
  const v = designGate({ agent_id: "ag" }, writeEv(proj, "design-system.md", URL_DS), cache, proj, "");
  expect(v?.kind).toBe("block");
  expect(v?.reason).toContain("Cannot write design-system.md");
});
test("scope proof: htmlCssPipelineGate is a pure predicate over (filePath, state, fileExists) — non-.html/.css always null regardless of phase", () => {
  const phase0: DesignState = initDesignState("ag", "full", false);
  expect(htmlCssPipelineGate("notes.md", phase0, false)).toBeNull();
  expect(htmlCssPipelineGate("Foo.tsx", phase0, false)).toBeNull();
  expect(htmlCssPipelineGate("index.html", phase0, false)?.kind).toBe("block");
});
