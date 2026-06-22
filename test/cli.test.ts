import { test, expect } from "bun:test";
import { checkStaged } from "../src/cli/run";

test("checkStaged: flags oversized code, ignores small + non-code", () => {
  const read = (p: string): string => (p === "big.ts" ? "x\n".repeat(150) : "ok");
  const v = checkStaged(["big.ts", "small.ts", "README.md"], read);
  expect(v.length).toBe(1);
  expect(v[0]).toContain("big.ts");
  expect(v[0]).toContain("BLOCKED");
});

test("checkStaged: all small -> no violations", () => {
  expect(checkStaged(["a.ts", "b.ts"], () => "ok")).toEqual([]);
});
