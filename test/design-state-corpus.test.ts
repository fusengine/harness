import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDesignState, saveDesignState, initDesignState } from "../src/policy/design/state";
import { recordPost } from "../src/runtime/design-helpers";
import { designPassNotice } from "../src/policy/design/gates";
import { setActiveDesignAgent } from "../src/policy/design/flag";
import type { NormalizedEvent } from "../src/runtime/normalize";

const tmp = (): string => mkdtempSync(join(tmpdir(), "fh-rc-"));

test("retrocompat: a persisted state without corpusReads loads with an empty list", () => {
  const cache = tmp();
  const legacy = {
    agentId: "a", mode: "page", currentPhase: 1, phasesCompleted: [], inspirationRead: true,
    scrolledSinceNav: false, screenshotsCount: 0, designSystemExists: false, designSystemValid: false, geminiCalls: 0,
  };
  writeFileSync(join(cache, ".design-state-a.json"), JSON.stringify(legacy));
  expect(loadDesignState(cache, "a")?.corpusReads).toEqual([]);
});

test("initDesignState initializes corpusReads explicitly", () => {
  expect(initDesignState("a", "full", false).corpusReads).toEqual([]);
});

test("recordPost: a corpus Read counts only a file that exists under the corpus root", () => {
  const cache = tmp();
  const plugins = tmp();
  const root = join(plugins, "design-expert", "skills", "design-web", "references", "refs-design");
  mkdirSync(join(root, "umbrel-recode"), { recursive: true });
  writeFileSync(join(root, "umbrel-recode", "tokens-umbrel.md"), "# tokens");
  saveDesignState(cache, { ...initDesignState("a", "component", false), currentPhase: 1 });
  const ev = (tool: string, p: string): NormalizedEvent => ({ phase: "post", tool, input: {}, sessionId: "s", filePath: p });
  recordPost(ev("Read", join(root, "umbrel-recode", "tokens-umbrel.md")), cache, loadDesignState(cache, "a")!, root, true);
  recordPost(ev("Read", join(root, "ghost-recode", "tokens-ghost.md")), cache, loadDesignState(cache, "a")!, root, true);
  let s = loadDesignState(cache, "a")!;
  expect(s.corpusReads).toEqual(["umbrel-recode/tokens-umbrel.md"]);
  expect(s.currentPhase).toBe(1); // component: the corpus read alone is not enough — one screenshot is always required
  recordPost(ev("mcp__fuse-browser__browser_screenshot", ""), cache, s, root, true);
  s = loadDesignState(cache, "a")!;
  expect(s.currentPhase).toBe(2);
});

test("recordPost: a garbage design-system.md write is NOT validated — phase 3 stays closed", () => {
  const cache = tmp();
  const f = join(tmp(), "design-system.md");
  writeFileSync(f, "TOTAL GARBAGE, zero design content");
  saveDesignState(cache, { ...initDesignState("a", "page", true), currentPhase: 2 });
  const ev = (): NormalizedEvent => ({ phase: "post", tool: "Write", input: {}, sessionId: "s", filePath: f });
  recordPost(ev(), cache, loadDesignState(cache, "a")!, "", false);
  const s = loadDesignState(cache, "a")!;
  expect(s.designSystemValid).toBe(false);
  expect(s.currentPhase).toBe(2);
});

test("recordPost: a valid design-system.md write IS validated and opens phase 3", () => {
  const cache = tmp();
  const f = join(tmp(), "design-system.md");
  writeFileSync(f, "## Design Reference\nInspiration: https://boulangerie-dupont.fr\n--a: oklch(0.62 0.19 250);\n--font: \"Fraunces\";");
  saveDesignState(cache, { ...initDesignState("a", "page", true), currentPhase: 2 });
  const ev = (): NormalizedEvent => ({ phase: "post", tool: "Write", input: {}, sessionId: "s", filePath: f });
  recordPost(ev(), cache, loadDesignState(cache, "a")!, "", false);
  const s = loadDesignState(cache, "a")!;
  expect(s.designSystemValid).toBe(true);
  expect(s.currentPhase).toBe(3);
});

test("pass notice: a missing corpus surfaces a user-visible warning (fail-open is not silent)", () => {
  const cache = tmp();
  setActiveDesignAgent(cache, "a");
  saveDesignState(cache, initDesignState("a", "full", false));
  const p = designPassNotice(
    { agentId: "a", tool: "mcp__fuse-browser__browser_navigate", filePath: "", content: "", url: "https://x.fr", phase: "pre", corpusMissing: true },
    cache,
  );
  expect(p?.kind).toBe("inform");
  expect(p?.userMessage).toContain("corpus");
});
