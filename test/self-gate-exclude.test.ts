import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isSelfGateSourcePath } from "../src/policy/framework-solid-exclude";
import { frameworkSolidGate } from "../src/policy/framework-solid";

/** Every detector source file covered by the self-gate exclusion (F0.3). */
const DETECTORS = [
  "framework-solid-gates.ts",
  "framework-solid-gates-systems.ts",
  "framework-solid-extended.ts",
  "detect-framework.ts",
  "conventions/stores.ts",
  "conventions/query.ts",
  "conventions/interfaces.ts",
  "conventions/react-hooks.ts",
  "conventions/strip.ts",
  "guards/interface-separation-ext.ts",
];

test("F0.3: isSelfGateSourcePath is TRUE for every detector source (not luck)", () => {
  for (const f of DETECTORS) {
    expect(isSelfGateSourcePath(join("/repo/src/policy", f))).toBe(true);
  }
  expect(isSelfGateSourcePath("/repo/src/policy/framework-solid.ts")).toBe(false);
  expect(isSelfGateSourcePath("/repo/src/policy/guards/interface-separation.ts")).toBe(false);
  expect(isSelfGateSourcePath("/repo/src/components/Foo.tsx")).toBe(false);
});

test("F0.3: gates return no verdict on the real disk content of each detector", () => {
  const prev = process.env.FUSE_CONVENTIONS_MODE;
  process.env.FUSE_CONVENTIONS_MODE = "deny";
  try {
    for (const f of DETECTORS) {
      const path = join(new URL("../src/policy", import.meta.url).pathname, f);
      expect(frameworkSolidGate(path, readFileSync(path, "utf8"))).toBeNull();
    }
  } finally {
    if (prev === undefined) delete process.env.FUSE_CONVENTIONS_MODE;
    else process.env.FUSE_CONVENTIONS_MODE = prev;
  }
});
