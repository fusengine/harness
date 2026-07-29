import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeEvent } from "../src/runtime/normalize";
import { designGate } from "../src/runtime/design";
import { setActiveDesignAgent } from "../src/policy/design/flag";
import { loadDesignState, saveDesignState, initDesignState } from "../src/policy/design/state";

/**
 * apply_patch through the REAL chain — parseApplyPatch → normalizeEvent →
 * designGate. For op:"update" the patch content is a HUNK, never the
 * document: the PRE must not content-gate it (validation deferred to POST),
 * the POST validates the real file from disk.
 */
const URL_DS = "## Design Reference\nInspiration: https://boulangerie-dupont.fr\n--a: oklch(0.62 0.19 250);\n--font: \"Fraunces\";";
const tmp = (): string => mkdtempSync(join(tmpdir(), "fh-ap-"));

function setup(diskContent: string) {
  const cache = tmp();
  const proj = tmp();
  const f = join(proj, "design-system.md");
  writeFileSync(f, diskContent);
  setActiveDesignAgent(cache, "ag");
  saveDesignState(cache, { ...initDesignState("ag", "full", false), currentPhase: 2, inspirationRead: true, screenshotsCount: 4 });
  return { cache, proj, f };
}
const ev = (phase: string, patch: string) =>
  normalizeEvent("codex", { hook_event_name: phase === "pre" ? "PreToolUse" : "PostToolUse", tool_name: "apply_patch", tool_input: { command: patch }, session_id: "s", agent_id: "ag" });

test("update patch on a VALID design-system.md: PRE allows (the hunk is not the document), POST validates the real file", () => {
  const { cache, proj, f } = setup(URL_DS);
  const patch = `*** Begin Patch\n*** Update File: ${f}\n@@\n-Inspiration: https://boulangerie-dupont.fr\n+Inspiration: https://boulangerie-martin.fr\n*** End Patch`;
  expect(designGate({ agent_id: "ag" }, ev("pre", patch), cache, proj, "")).toBeNull();
  // The tool lands: the real file now carries the new URL (still valid).
  writeFileSync(f, URL_DS.replace("boulangerie-dupont", "boulangerie-martin"));
  expect(designGate({ agent_id: "ag" }, ev("post", patch), cache, proj, "")).toBeNull();
  const s = loadDesignState(cache, "ag")!;
  expect(s.designSystemValid).toBe(true);
  expect(s.currentPhase).toBe(3);
});

test("POST promotes via a RELATIVE patch path — the cwd wiring is load-bearing, relative is the normal form", () => {
  const cache = tmp();
  const proj = tmp();
  writeFileSync(join(proj, "design-system.md"), URL_DS);
  setActiveDesignAgent(cache, "ag");
  saveDesignState(cache, { ...initDesignState("ag", "full", false), currentPhase: 2, inspirationRead: true, screenshotsCount: 4 });
  const patch = `*** Begin Patch\n*** Update File: design-system.md\n@@\n-Inspiration: https://boulangerie-dupont.fr\n+Inspiration: https://boulangerie-martin.fr\n*** End Patch`;
  writeFileSync(join(proj, "design-system.md"), URL_DS.replace("boulangerie-dupont", "boulangerie-martin"));
  expect(designGate({ agent_id: "ag" }, ev("post", patch), cache, proj, "")).toBeNull();
  const s = loadDesignState(cache, "ag")!;
  expect(s.designSystemValid).toBe(true);
  expect(s.currentPhase).toBe(3);
});

test("a delete op never promotes — even when the file still exists and is clean", () => {
  const cache = tmp();
  const proj = tmp();
  writeFileSync(join(proj, "design-system.md"), URL_DS);
  setActiveDesignAgent(cache, "ag");
  saveDesignState(cache, { ...initDesignState("ag", "full", false), currentPhase: 2, inspirationRead: true, screenshotsCount: 4 });
  const patch = `*** Begin Patch\n*** Delete File: design-system.md\n*** End Patch`;
  expect(designGate({ agent_id: "ag" }, ev("post", patch), cache, proj, "")).toBeNull();
  const s = loadDesignState(cache, "ag")!;
  expect(s.designSystemValid).toBe(false);
  expect(s.currentPhase).toBe(2);
});

test("delete is skipped even at phase 0 — the write gate never sees it", () => {
  const cache = tmp();
  const proj = tmp();
  setActiveDesignAgent(cache, "ag");
  saveDesignState(cache, initDesignState("ag", "full", false)); // phase 0: designSystemWriteGate WOULD block
  const patch = `*** Begin Patch\n*** Delete File: ${join(proj, "design-system.md")}\n*** End Patch`;
  expect(designGate({ agent_id: "ag" }, ev("pre", patch), cache, proj, "")).toBeNull();
});

test("add of a generic design-system.md is still blocked at PRE (add content IS the document)", () => {
  const { cache, proj } = setup(URL_DS);
  const patch = `*** Begin Patch\n*** Add File: ${join(proj, "design-system.md")}\n+TOTAL GARBAGE, zero design content\n*** End Patch`;
  expect(designGate({ agent_id: "ag" }, ev("pre", patch), cache, proj, "")?.kind).toBe("block");
});

test("a multi-file envelope is blocked by its LAST faulty file, not only its first", () => {
  const { cache, proj } = setup(URL_DS);
  const patch = `*** Begin Patch\n*** Add File: ${join(proj, "ok.css")}\n+div { color: red; }\n*** Add File: ${join(proj, "design-system.md")}\n+TOTAL GARBAGE\n*** End Patch`;
  expect(designGate({ agent_id: "ag" }, ev("pre", patch), cache, proj, "")?.kind).toBe("block");
});
