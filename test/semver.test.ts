import { test, expect } from "bun:test";
import { compareSemver, maxSemver } from "../src/util/semver";

test("compareSemver: numeric segments, never lexicographic", () => {
  expect(compareSemver("1.0.9", "1.0.23")).toBeLessThan(0);
  expect(compareSemver("1.0.23", "1.0.9")).toBeGreaterThan(0);
  expect(compareSemver("1.0.10", "1.0.9")).toBeGreaterThan(0);
  expect(compareSemver("1.0.9", "1.0.9")).toBe(0);
  expect(compareSemver("2.0.0", "10.0.0")).toBeLessThan(0);
});

test("compareSemver: unequal segment counts pad with zeros", () => {
  expect(compareSemver("1.0", "1.0.1")).toBeLessThan(0);
  expect(compareSemver("1.0.0", "1.0")).toBe(0);
});

test("compareSemver: prerelease segments never yield NaN (sort stays defined)", () => {
  expect(compareSemver("1.0.0-beta", "1.0.0-beta")).toBe(0);
  expect(compareSemver("1.0.0-alpha", "1.0.0-beta")).toBeLessThan(0);
  const shuffled = ["1.0.0-beta", "1.0.23", "1.0.9", "1.0.0-alpha"].sort(compareSemver);
  expect(shuffled).toEqual(["1.0.0-alpha", "1.0.0-beta", "1.0.9", "1.0.23"]);
});

test("maxSemver: picks the highest, null on empty", () => {
  expect(maxSemver(["1.0.9", "1.0.23"])).toBe("1.0.23");
  expect(maxSemver(["1.0.9", "1.0.10", "1.0.2"])).toBe("1.0.10");
  expect(maxSemver([])).toBeNull();
});
