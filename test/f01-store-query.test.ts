import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { frameworkSolidGate } from "../src/policy/framework-solid";

function project(deps: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "fh-f01-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: deps }));
  return dir;
}
function withAdvisory<T>(fn: () => T): T {
  const prev = process.env.FUSE_CONVENTIONS_MODE;
  process.env.FUSE_CONVENTIONS_MODE = "advisory";
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.FUSE_CONVENTIONS_MODE;
    else process.env.FUSE_CONVENTIONS_MODE = prev;
  }
}
const REACT = { react: "19" };
const Z = "import { create } from 'zustand';\nexport const useS = create(() => ({}));\n";
const P = "import { defineStore } from 'pinia';\nexport const useS = defineStore('s', () => {});\n";

test("F0.1: zustand plain outside stores/ -> advisory store; inside stores/ -> ALLOW", () => {
  const dir = project(REACT);
  const outside = withAdvisory(() => frameworkSolidGate(join(dir, "modules/u/src/auth.ts"), Z));
  expect(outside?.kind).toBe("inform");
  expect(outside?.reason).toContain("src/stores/");
  expect(frameworkSolidGate(join(dir, "modules/u/src/stores/s.store.ts"), Z)).toBeNull();
});

test("F0.1: pinia outside stores/ -> advisory store; inside stores/ -> ALLOW", () => {
  const dir = project({ vue: "3", pinia: "2" });
  const outside = withAdvisory(() => frameworkSolidGate(join(dir, "modules/u/src/auth.ts"), P));
  expect(outside?.kind).toBe("inform");
  expect(outside?.reason).toContain("src/stores/");
  expect(frameworkSolidGate(join(dir, "modules/u/src/stores/s.store.ts"), P)).toBeNull();
});

test("F0.1: curried signature unchanged; comment-import + home-made create stays silent", () => {
  const dir = project(REACT);
  const curried = "export const useS = create<S>()((set) => ({}));\n";
  expect(withAdvisory(() => frameworkSolidGate(join(dir, "modules/u/src/auth.ts"), curried))?.reason).toContain("src/stores/");
  const fake = "// import { create } from 'zustand';\nexport const w = create(() => ({ render() {} }));\n";
  expect(frameworkSolidGate(join(dir, "modules/u/src/factory.ts"), fake)).toBeNull();
});

test("F0.2: fake useQuery WITHOUT the dep -> legacy hook rule hard-denies (byte-identical)", () => {
  const dir = project(REACT);
  const src = "import { useQuery } from '@tanstack/react-query';\nexport function useUsers() {\n  return useQuery({ queryKey: ['u'] });\n}\n";
  const p = frameworkSolidGate(join(dir, "modules/u/components/Users.tsx"), src);
  expect(p?.kind).toBe("block");
  expect(p?.reason).toContain("Move to hooks/.");
});

test("F0.2: real useQuery WITH the dep -> advisory query rule (not the hook block)", () => {
  const dir = project({ react: "19", "@tanstack/react-query": "5" });
  const src = "import { useQuery } from '@tanstack/react-query';\nexport function useUsers() {\n  return useQuery({ queryKey: ['u'] });\n}\n";
  const p = withAdvisory(() => frameworkSolidGate(join(dir, "modules/u/components/Users.tsx"), src));
  expect(p?.kind).toBe("inform");
  expect(p?.reason).toContain("src/query/");
});
