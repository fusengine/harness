import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { oncePerWindow, onceExclusive, DEDUP_WINDOW_MS } from "../src/runtime/inject-dedup";
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

test("onceExclusive: same key twice inside the window → only the first call wins", () => {
  const d = dir();
  expect(onceExclusive("k", 5000, { dir: d, now: 1000 })).toBe(true);
  expect(onceExclusive("k", 5000, { dir: d, now: 1500 })).toBe(false);
});

test("onceExclusive: different keys both win in the same window", () => {
  const d = dir();
  expect(onceExclusive("a", 5000, { dir: d, now: 1000 })).toBe(true);
  expect(onceExclusive("b", 5000, { dir: d, now: 1000 })).toBe(true);
});

test("onceExclusive: re-emission allowed once the window has elapsed (expired marker is swept)", () => {
  const d = dir();
  expect(onceExclusive("k", 5000, { dir: d, now: 1000 })).toBe(true);
  expect(onceExclusive("k", 5000, { dir: d, now: 6000 })).toBe(true);
});

test("onceExclusive: purge sweeps expired marker files out of the lock directory", () => {
  const d = dir();
  onceExclusive("k1", 1000, { dir: d, now: 1000 });
  onceExclusive("k2", 1000, { dir: d, now: 1000 });
  const lockDir = join(d, "inject-dedup-locks");
  expect(readdirSync(lockDir).length).toBe(2);
  // Both markers are now older than the window; the next call's sweep removes them
  // before creating its own — the directory never grows unbounded.
  onceExclusive("k3", 1000, { dir: d, now: 5000 });
  expect(readdirSync(lockDir).length).toBe(1);
});
