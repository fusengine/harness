import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, existsSync } from "node:fs";
import { join } from "node:path";
import { oncePerWindow, DEDUP_WINDOW_MS } from "../src/runtime/inject-dedup";
import { claudeMdKey } from "../src/runtime/inject-context";

const dir = (): string => mkdtempSync(join(tmpdir(), "fh-dedup-"));

test("oncePerWindow: same key twice inside the window → second is suppressed", () => {
  const d = dir();
  expect(oncePerWindow("k", 5000, { dir: d, now: 1000 })).toBe(true);
  expect(oncePerWindow("k", 5000, { dir: d, now: 1500 })).toBe(false);
});

test("oncePerWindow: different keys both pass in the same window", () => {
  const d = dir();
  expect(oncePerWindow("a", 5000, { dir: d, now: 1000 })).toBe(true);
  expect(oncePerWindow("b", 5000, { dir: d, now: 1000 })).toBe(true);
});

test("oncePerWindow: re-emission allowed once the window has elapsed", () => {
  const d = dir();
  expect(oncePerWindow("k", 5000, { dir: d, now: 1000 })).toBe(true);
  // now - last = 5000 which is NOT < windowMs → the entry is pruned and re-allowed.
  expect(oncePerWindow("k", 5000, { dir: d, now: 6000 })).toBe(true);
});

test("oncePerWindow: at the window boundary the first emission still wins", () => {
  const d = dir();
  expect(oncePerWindow("k", 5000, { dir: d, now: 1000 })).toBe(true);
  expect(oncePerWindow("k", 5000, { dir: d, now: 5999 })).toBe(false);
});

test("oncePerWindow: persists a sidecar in the given state dir", () => {
  const d = dir();
  oncePerWindow("k", 5000, { dir: d, now: 1000 });
  expect(existsSync(join(d, "inject-dedup.json"))).toBe(true);
});

test("DEDUP_WINDOW_MS default is a short same-turn window (not a next-turn suppressor)", () => {
  expect(DEDUP_WINDOW_MS).toBeGreaterThan(0);
  expect(DEDUP_WINDOW_MS).toBeLessThanOrEqual(5000);
});

test("owner invariant: two DIFFERENT non-dev prompts with an identical CLAUDE.md block both emit within the window", () => {
  const d = dir();
  // Non-dev prompts produce a prompt-independent block (just CLAUDE.md), so
  // the ctx hashes match — only the prompt hash keeps the keys distinct.
  const ctx = "# CLAUDE.md\nsame block";
  expect(oncePerWindow(claudeMdKey("what is this repo?", ctx), DEDUP_WINDOW_MS, { dir: d, now: 1000 })).toBe(true);
  expect(oncePerWindow(claudeMdKey("explain the gate", ctx), DEDUP_WINDOW_MS, { dir: d, now: 1500 })).toBe(true);
});

test("owner invariant: the SAME turn (same prompt + same block) double-firing is still suppressed", () => {
  const d = dir();
  const ctx = "# CLAUDE.md\nsame block";
  expect(oncePerWindow(claudeMdKey("same prompt", ctx), DEDUP_WINDOW_MS, { dir: d, now: 1000 })).toBe(true);
  expect(oncePerWindow(claudeMdKey("same prompt", ctx), DEDUP_WINDOW_MS, { dir: d, now: 1200 })).toBe(false);
});
