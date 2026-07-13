import { test, expect } from "bun:test";
import { checkStaged } from "../src/cli/run";
import { resolveMaxLines } from "../src/config/limits";

test("checkStaged: flags oversized code, ignores small + non-code", () => {
  // Tracks the gate's own resolver (`FUSE_SOLID_MAX_LINES` ?? default) so this
  // fixture stays oversized regardless of the ambient env override.
  const read = (p: string): string => (p === "big.ts" ? "x\n".repeat(resolveMaxLines() + 50) : "ok");
  const v = checkStaged(["big.ts", "small.ts", "README.md"], read);
  expect(v.length).toBe(1);
  expect(v[0]).toContain("big.ts");
  expect(v[0]).toContain("BLOCKED");
});

test("checkStaged: all small -> no violations", () => {
  expect(checkStaged(["a.ts", "b.ts"], () => "ok")).toEqual([]);
});
