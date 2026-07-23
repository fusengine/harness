import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { frameworkSolidGate } from "../src/policy/framework-solid";

// H1 (in-vivo Next.js crash): a bare client component (hooks, NO next marker,
// NO directive) must route MANIFEST-FIRST — a next project sends it to
// nextGate's 'use client' rule even when NEXT_RE does not match the content.
function project(deps: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "fh-h1-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: deps }));
  return dir;
}
/** Pin the env the gates read — the dev machine exports FUSE_SOLID_MAX_LINES=200. */
function pinned<T>(fn: () => T): T {
  const saved = { M: process.env.FUSE_SOLID_MAX_LINES, C: process.env.FUSE_CONVENTIONS_MODE };
  process.env.FUSE_SOLID_MAX_LINES = "100";
  process.env.FUSE_CONVENTIONS_MODE = "deny";
  try { return fn(); } finally {
    if (saved.M === undefined) delete process.env.FUSE_SOLID_MAX_LINES; else process.env.FUSE_SOLID_MAX_LINES = saved.M;
    if (saved.C === undefined) delete process.env.FUSE_CONVENTIONS_MODE; else process.env.FUSE_CONVENTIONS_MODE = saved.C;
  }
}
/** Bare client component: client hook, zero next marker, zero directive. */
const CLIENT = "import { useState } from 'react';\nexport default function StatCard() {\n  const [n] = useState(0);\n  return <div>{n}</div>;\n}\n";

test("H1(a): next manifest + marker-less client component WITHOUT directive -> BLOCK directive missing (the in-vivo FN)", () => {
  const dir = project({ next: "15", react: "19" });
  const p = pinned(() => frameworkSolidGate(join(dir, "src/components/StatCard.tsx"), CLIENT));
  expect(p?.kind).toBe("block");
  expect(p?.reason).toContain("'use client' directive missing");
});

test("H1(b): same project, same file WITH the directive -> clean", () => {
  const dir = project({ next: "15", react: "19" });
  expect(pinned(() => frameworkSolidGate(join(dir, "src/components/StatCard.tsx"), "'use client';\n" + CLIENT))).toBeNull();
});

test("H1(c): plain-react manifest + same file without directive -> NO directive rule (reactGate)", () => {
  const dir = project({ react: "19" });
  const p = pinned(() => frameworkSolidGate(join(dir, "src/components/StatCard.tsx"), CLIENT));
  expect(p?.reason ?? "").not.toContain("'use client' directive missing");
});

test("H1(d): NO manifest -> legacy NEXT_RE routing, byte-identical (both branches)", () => {
  const dir = mkdtempSync(join(tmpdir(), "fh-h1-nomanifest-")); // no package.json
  const iface = "export interface FooProps {\n  bar: string;\n}\n";
  const fp = join(dir, "src/components/Foo.tsx");
  const withMarker = pinned(() => frameworkSolidGate(fp, "import x from 'next/server';\n" + iface));
  expect(withMarker?.reason).toContain("Move to src/interfaces/."); // nextGate wording
  expect(withMarker?.reason).not.toContain("or src/types/");
  const noMarker = pinned(() => frameworkSolidGate(fp, iface));
  expect(noMarker?.reason).toContain("src/interfaces/ or src/types/"); // reactGate wording
});

test("H1(f): the router + gate sources never self-trigger", () => {
  for (const f of ["framework-solid.ts", "js-gate-route.ts"]) {
    const p = join(import.meta.dir, "../src/policy", f);
    expect(pinned(() => frameworkSolidGate(p, readFileSync(p, "utf8")))).toBeNull();
  }
});
