import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isUiWrite, designSkillRead, uiDesignSkillGate, type DesignEvidence } from "../src/policy/design/skill-gate";
import { collectDesignEvidence } from "../src/policy/design/skill-evidence";
import { designGate } from "../src/runtime/design";
import { setActiveDesignAgent } from "../src/policy/design/flag";
import { loadDesignState } from "../src/policy/design/state";
import { signTrack } from "../src/tracking/integrity";
import { emptyTrack, recordDoc, recordRefRead } from "../src/tracking/session-state";
import { trackFile } from "../src/runtime/paths";
import type { NormalizedEvent } from "../src/runtime/normalize";

const tmp = (): string => mkdtempSync(join(tmpdir(), "fh-dsg-"));
const SKILL = "~/.claude/plugins/marketplaces/x/plugins/react-expert/skills/solid-react/SKILL.md";
const READY: DesignEvidence = { refsRead: [SKILL], docConsulted: true };
const ev = (e: NormalizedEvent): NormalizedEvent => e;

test("isUiWrite: tsx/scss in UI path or with Tailwind, not .ts/.html/.css", () => {
  expect(isUiWrite("Write", "src/components/Hero.tsx", "")).toBe(true);
  expect(isUiWrite("Write", "src/lib/util.tsx", 'className="flex p-4"')).toBe(true);
  expect(isUiWrite("Write", "src/lib/util.tsx", "const x = 1")).toBe(false);
  expect(isUiWrite("Write", "src/components/Card.scss", "")).toBe(true);
  expect(isUiWrite("Write", "src/components/x.ts", "")).toBe(false);
  expect(isUiWrite("Write", "src/components/page.html", "")).toBe(false);
  expect(isUiWrite("Write", "node_modules/ui/x.tsx", "")).toBe(false);
  expect(isUiWrite("Read", "src/components/Hero.tsx", "")).toBe(false);
});

test("designSkillRead: matches design skill ref paths", () => {
  expect(designSkillRead([SKILL])).toBe(true);
  expect(designSkillRead(["skills/3-generating-components/SKILL.md"])).toBe(true);
  expect(designSkillRead(["skills/laravel-eloquent/SKILL.md"])).toBe(false);
  expect(designSkillRead([])).toBe(false);
});

test("uiDesignSkillGate: blocks UI write without skill read", () => {
  const p = uiDesignSkillGate("Write", "src/components/Hero.tsx", "", { refsRead: [], docConsulted: true });
  expect(p?.kind).toBe("block");
  expect(p?.reason).toContain("design skill not consulted");
});

test("uiDesignSkillGate: blocks UI write without doc consulted (skill read alone is not enough)", () => {
  const p = uiDesignSkillGate("Write", "src/components/Hero.tsx", "", { refsRead: [SKILL], docConsulted: false });
  expect(p?.kind).toBe("block");
  expect(p?.reason).toContain("no documentation consulted");
});

test("uiDesignSkillGate: allows after skill + ANY doc — Gemini NEVER required", () => {
  expect(uiDesignSkillGate("Write", "src/components/Hero.tsx", "", READY)).toBeNull();
  const blockedReason = uiDesignSkillGate("Write", "src/components/Hero.tsx", "", { refsRead: [SKILL], docConsulted: false })?.reason ?? "";
  // The block path advertises Context7/Exa/web and explicitly states Gemini is not required.
  expect(blockedReason).toContain("Gemini is NOT required");
});

test("uiDesignSkillGate: non-UI write is allowed", () => {
  expect(uiDesignSkillGate("Write", "src/index.ts", "x", { refsRead: [], docConsulted: false })).toBeNull();
});

test("collectDesignEvidence: derives refsRead + docConsulted from the verified track (context7 OR exa)", () => {
  const dir = tmp();
  const sid = "s-ev";
  let track = recordRefRead(emptyTrack(), SKILL);
  track = recordDoc(track, "react", sid, "mcp__context7__query-docs");
  writeFileSync(trackFile(sid, dir), JSON.stringify(signTrack(track)));
  const got = collectDesignEvidence(sid, "/proj", dir);
  expect(got.docConsulted).toBe(true);
  expect(designSkillRead(got.refsRead)).toBe(true);
  // Missing track → fail-closed (no evidence).
  const none = collectDesignEvidence("absent", "/proj", dir);
  expect(none.docConsulted).toBe(false);
  expect(none.refsRead).toEqual([]);
});

test("designGate: UI .tsx write blocked when no skill/doc evidence (ports check-design-skill)", () => {
  const cache = tmp();
  const e = ev({ phase: "pre", tool: "Write", input: {}, sessionId: "no-ev", filePath: "src/components/Hero.tsx", content: 'className="flex"' });
  const p = designGate({}, e, cache, "/proj");
  expect(p?.kind).toBe("block");
  expect(p?.title).toBe("Design skill");
});

test("designGate P5: active flag + missing state auto-inits instead of fail-open null", () => {
  const cache = tmp();
  setActiveDesignAgent(cache, "agX");
  // A fuse-browser navigate at phase 0 must now be gated (was null before the fix).
  const e = ev({ phase: "pre", tool: "mcp__fuse-browser__browser_navigate", input: { url: "https://example.com" }, sessionId: "s5", filePath: undefined, content: undefined });
  const p = designGate({}, e, cache, "/proj");
  expect(p?.kind).toBe("block");
  expect(loadDesignState(cache, "agX")).not.toBeNull();
});

test("designGate: no flag + non-UI tool stays inert (null)", () => {
  const cache = tmp();
  const e = ev({ phase: "pre", tool: "mcp__fuse-browser__browser_navigate", input: { url: "https://example.com" }, sessionId: "s6", filePath: undefined, content: undefined });
  expect(designGate({}, e, cache, "/proj")).toBeNull();
});
