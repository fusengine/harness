import { test, expect } from "bun:test";
import { fragmentRegistry, resetFragmentRegistry } from "../src/runtime/fragment-registry";
import { capFragment } from "../src/runtime/inject-budget";

test("fragmentRegistry: starts empty after a reset", () => {
  resetFragmentRegistry();
  expect(fragmentRegistry()).toEqual([]);
});

test("fragmentRegistry: capFragment records one entry per call, in call order", () => {
  resetFragmentRegistry();
  capFragment("a", "short");
  capFragment("b", "x".repeat(20_000));
  const entries = fragmentRegistry();
  expect(entries.length).toBe(2);
  expect(entries[0]?.label).toBe("a");
  expect(entries[0]?.chars).toBe(5);
  expect(entries[1]?.label).toBe("b");
  expect(entries[1]?.chars).toBeLessThanOrEqual(8000);
});

test("fragmentRegistry: reset clears prior entries, isolating the next event", () => {
  resetFragmentRegistry();
  capFragment("leftover", "x");
  resetFragmentRegistry();
  expect(fragmentRegistry()).toEqual([]);
});

test("fragmentRegistry: returns a snapshot copy, not a live reference", () => {
  resetFragmentRegistry();
  capFragment("a", "x");
  const snap = fragmentRegistry();
  capFragment("b", "y");
  expect(snap.length).toBe(1);
  expect(fragmentRegistry().length).toBe(2);
});
