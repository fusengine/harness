import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { designGate } from "../src/runtime/design";
import { setActiveDesignAgent } from "../src/policy/design/flag";
import { loadDesignState, saveDesignState, initDesignState } from "../src/policy/design/state";
import type { NormalizedEvent } from "../src/runtime/normalize";

/** Fixture: a delivered corpus (README + two tokens files) and an active design agent. */
function setup() {
  const cache = mkdtempSync(join(tmpdir(), "fh-gc-"));
  const root = join(mkdtempSync(join(tmpdir(), "fh-gc-root-")), "refs-design");
  mkdirSync(join(root, "a-recode"), { recursive: true });
  mkdirSync(join(root, "b-recode"), { recursive: true });
  writeFileSync(join(root, "README.md"), "# index");
  writeFileSync(join(root, "a-recode", "tokens-a.md"), "# a");
  writeFileSync(join(root, "b-recode", "tokens-b.md"), "# b");
  setActiveDesignAgent(cache, "ag");
  saveDesignState(cache, { ...initDesignState("ag", "full", false), currentPhase: 1, inspirationRead: true });
  const ev = (phase: "pre" | "post", tool: string, filePath = "", content = ""): NormalizedEvent =>
    ({ phase, tool, input: {}, sessionId: "s", filePath, content });
  const gate = (e: NormalizedEvent) => designGate({ agent_id: "ag" }, e, cache, "/proj", root, root);
  return { cache, root, ev, gate };
}

test("designGate with an injected corpus: reads advance the state, jointure enforced at write", () => {
  const { cache, root, ev, gate } = setup();
  // Corpus reads are recorded (distinct, existence-checked); phase waits for the screenshots.
  for (const f of ["README.md", "a-recode/tokens-a.md", "b-recode/tokens-b.md"]) {
    expect(gate(ev("post", "Read", join(root, f)))).toBeNull();
  }
  expect(loadDesignState(cache, "ag")!.corpusReads).toEqual(["README.md", "a-recode/tokens-a.md", "b-recode/tokens-b.md"]);
  expect(loadDesignState(cache, "ag")!.currentPhase).toBe(1);
  // A write of design-system.md is still blocked at phase 1.
  expect(gate(ev("pre", "Write", "/proj/design-system.md", "x"))?.kind).toBe("block");
  // Two screenshots complete the conjunction (full mode: corpus + 2 shots).
  gate(ev("post", "mcp__fuse-browser__browser_screenshot"));
  gate(ev("post", "mcp__fuse-browser__browser_screenshot"));
  expect(loadDesignState(cache, "ag")!.currentPhase).toBe(2);
});

test("designGate on apply_patch add (event.files): add content IS the document — garbage blocked, plugin root protected", () => {
  const { cache, root, ev, gate } = setup();
  for (const f of ["README.md", "a-recode/tokens-a.md", "b-recode/tokens-b.md"]) gate(ev("post", "Read", join(root, f)));
  gate(ev("post", "mcp__fuse-browser__browser_screenshot"));
  gate(ev("post", "mcp__fuse-browser__browser_screenshot"));
  const patch = (filePath: string, content: string, op: "add" | "update" | "delete"): NormalizedEvent =>
    ({ phase: "pre", tool: "apply_patch", input: {}, sessionId: "s", files: [{ filePath, content, op }] });
  const VALID = "## Design Reference\n- Corpus: a/## 1. T, b/## 2. U\n--a: oklch(0.62 0.19 250);";
  // A generic design-system.md via apply_patch add is blocked, exactly like a Write.
  expect(gate(patch("/proj/design-system.md", "TOTAL GARBAGE", "add"))?.kind).toBe("block");
  // A patch into the plugin root is blocked, whatever the op.
  expect(gate(patch(join(root, "fake", "tokens-fake.md"), "# fake", "add"))?.kind).toBe("block");
  // A valid ADD passes the PRE, and the POST validates the REAL file on disk.
  expect(gate(patch("/proj/design-system.md", VALID, "add"))).toBeNull();
  const proj = mkdtempSync(join(tmpdir(), "fh-ap-proj-"));
  writeFileSync(join(proj, "design-system.md"), VALID);
  const post: NormalizedEvent = { phase: "post", tool: "apply_patch", input: {}, sessionId: "s", files: [{ filePath: join(proj, "design-system.md"), content: VALID, op: "add" }] };
  gate(post);
  const s = loadDesignState(cache, "ag")!;
  expect(s.designSystemValid).toBe(true);
  expect(s.currentPhase).toBe(3);
});

test("corpusRoot override does NOT decide pluginsRoot — the guard covers the plugin root independently", () => {
  const { cache, root, ev } = setup();
  const plugins = mkdtempSync(join(tmpdir(), "fh-pg-"));
  const gate = (e: NormalizedEvent) => designGate({ agent_id: "ag" }, e, cache, "/proj", root, plugins);
  // A write under the PLUGIN root is blocked even though corpusRoot points elsewhere.
  expect(gate(ev("pre", "Write", join(plugins, "design-expert", "skills", "x", "tokens-x.md"), "# x"))?.kind).toBe("block");
  // And the corpus root alone no longer smuggles plugin-root coverage.
  expect(gate(ev("pre", "Write", join(root, "fake", "tokens-fake.md"), "# fake"))).toBeNull();
});

test("cwd is WIRED into pluginsWriteGuard: a RELATIVE patch path under the plugin root is blocked", () => {
  const cache = mkdtempSync(join(tmpdir(), "fh-cw-"));
  const proj = mkdtempSync(join(tmpdir(), "fh-cw-p-"));
  setActiveDesignAgent(cache, "ag");
  saveDesignState(cache, { ...initDesignState("ag", "full", false), currentPhase: 1, inspirationRead: true });
  const ev: NormalizedEvent = { phase: "pre", tool: "apply_patch", input: {}, sessionId: "s", files: [{ filePath: "fake/tokens-fake.md", content: "# fake", op: "add" }] };
  // pluginsRoot === proj here: the relative patch path resolves INTO it.
  expect(designGate({ agent_id: "ag" }, ev, cache, proj, "", proj)?.kind).toBe("block");
});

test("designGate: a write citing READ references passes; citing an unread one is blocked and named", () => {
  const { cache, root, ev, gate } = setup();
  for (const f of ["README.md", "a-recode/tokens-a.md", "b-recode/tokens-b.md"]) gate(ev("post", "Read", join(root, f)));
  gate(ev("post", "mcp__fuse-browser__browser_screenshot"));
  gate(ev("post", "mcp__fuse-browser__browser_screenshot"));
  const ds = (refs: string) => `## Design Reference\n- Corpus: ${refs}\n--a: oklch(0.62 0.19 250);`;
  expect(gate(ev("pre", "Write", "/proj/design-system.md", ds("a/## 1. T, b/## 2. U")))).toBeNull();
  const forged = gate(ev("pre", "Write", "/proj/design-system.md", ds("a/## 1. T, xai/## 9. Z")));
  expect(forged?.kind).toBe("block");
  expect(forged?.reason).toContain("xai");
  // The corpus itself is write-protected for the design agent.
  expect(gate(ev("pre", "Write", join(root, "fake", "tokens-fake.md"), "# fake"))?.kind).toBe("block");
});
