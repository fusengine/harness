import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectCaps } from "../src/policy/nearest-manifest";
import { detectFramework } from "../src/policy/detect-framework";

/** Temp project whose package.json carries the given deps. */
function project(deps: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "fh-tans-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: deps }));
  return dir;
}

test("projectCaps: zustand, pinia and @tanstack/* deps are read", () => {
  const caps = projectCaps(project({ react: "19", zustand: "5", "@tanstack/react-start": "1", "@tanstack/react-router": "1", "@tanstack/react-query": "5" }));
  for (const c of ["react", "zustand", "tanstack-start", "tanstack-router", "tanstack-query"] as const) {
    expect(caps.has(c)).toBe(true);
  }
  const vue = projectCaps(project({ vue: "3", pinia: "2", "@tanstack/vue-query": "5" }));
  expect(vue.has("vue")).toBe(true);
  expect(vue.has("pinia")).toBe(true);
  expect(vue.has("vue-query")).toBe(true);
  expect(vue.has("zustand")).toBe(false);
});

test("detectFramework: tanstack-start beats react when caps confirm", () => {
  const dir = project({ react: "19", "@tanstack/react-start": "1" });
  const route = "import { createFileRoute } from '@tanstack/react-router';\nexport const Route = createFileRoute('/')({ component: Home });";
  expect(detectFramework("src/routes/index.tsx", route, dir)).toBe("tanstack-start");
});

test("detectFramework: tanstack content without caps falls back (react, else generic)", () => {
  const dir = project({ react: "19" });
  const route = "import { createFileRoute } from '@tanstack/react-router';\nexport const Route = createFileRoute('/')({ component: Home });";
  expect(detectFramework("src/routes/index.tsx", route, dir)).toBe("react");
  const empty = project({});
  expect(detectFramework("src/routes/index.tsx", route, empty)).toBe("generic");
});

test("detectFramework: react/nextjs detection unchanged (zero-regression)", () => {
  const next = project({ next: "15", react: "19" });
  expect(detectFramework("app/page.tsx", "export default function Page() { return null; }", next)).toBe("nextjs");
  const react = project({ react: "19" });
  expect(detectFramework("src/App.tsx", "import { useState } from 'react';", react)).toBe("react");
  expect(detectFramework("src/lib/util.ts", "export const add = (a: number, b: number) => a + b;", react)).toBe("generic");
});
