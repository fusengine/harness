import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDesignState, saveDesignState, initDesignState } from "../src/policy/design/state";
import { recordPost } from "../src/runtime/design-helpers";
import type { NormalizedEvent } from "../src/runtime/normalize";

/**
 * C1: screenshotsCount must credit the fuse-browser batch capture primitives
 * (browser_shots_batch, browser_site_shots), not just the unit screenshot —
 * else capturing efficiently makes the phase-2 quota infranchissable.
 */
const tmp = (): string => mkdtempSync(join(tmpdir(), "fh-shot-"));

function freshState(cache: string): void {
  saveDesignState(cache, initDesignState("a", "component", true));
}

function post(tool: string, input: Record<string, unknown> = {}): NormalizedEvent {
  return { phase: "post", tool, input, sessionId: "s" };
}

test("C1: browser_shots_batch credits the screenshot quota", () => {
  const cache = tmp();
  freshState(cache);
  recordPost(post("mcp__fuse-browser__browser_shots_batch"), cache, loadDesignState(cache, "a")!, "", false);
  expect(loadDesignState(cache, "a")!.screenshotsCount).toBe(1);
});

test("C1: browser_site_shots credits the screenshot quota", () => {
  const cache = tmp();
  freshState(cache);
  recordPost(post("mcp__fuse-browser__browser_site_shots"), cache, loadDesignState(cache, "a")!, "", false);
  expect(loadDesignState(cache, "a")!.screenshotsCount).toBe(1);
});

test("C1 non-regression: browser_screenshot (unit capture) still credits", () => {
  const cache = tmp();
  freshState(cache);
  recordPost(post("mcp__fuse-browser__browser_screenshot"), cache, loadDesignState(cache, "a")!, "", false);
  expect(loadDesignState(cache, "a")!.screenshotsCount).toBe(1);
});

test("C1 anti-over-width: a non-capture tool does NOT credit the quota", () => {
  const cache = tmp();
  freshState(cache);
  recordPost(post("mcp__fuse-browser__browser_navigate"), cache, loadDesignState(cache, "a")!, "", false);
  expect(loadDesignState(cache, "a")!.screenshotsCount).toBe(0);
  recordPost(post("Read", { file_path: "/tmp/whatever.md" }), cache, loadDesignState(cache, "a")!, "", false);
  expect(loadDesignState(cache, "a")!.screenshotsCount).toBe(0);
});

test("C1: a batch call credits exactly 1, never the N urls it may have shot", () => {
  const cache = tmp();
  freshState(cache);
  let state = loadDesignState(cache, "a")!;
  recordPost(post("mcp__fuse-browser__browser_site_shots", { urls: ["a", "b", "c"] }), cache, state, "", false);
  state = loadDesignState(cache, "a")!;
  expect(state.screenshotsCount).toBe(1);
  recordPost(post("mcp__fuse-browser__browser_site_shots", { urls: ["d", "e"] }), cache, state, "", false);
  expect(loadDesignState(cache, "a")!.screenshotsCount).toBe(2);
});
