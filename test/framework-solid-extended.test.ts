import { test, expect } from "bun:test";
import { frameworkSolidGate } from "../src/policy/framework-solid";
import { countFrameworkCodeLines } from "../src/policy/file-size";

function withMode<T>(mode: string | undefined, fn: () => T): T {
  const prev = process.env.FUSE_CONVENTIONS_MODE;
  if (mode === undefined) delete process.env.FUSE_CONVENTIONS_MODE;
  else process.env.FUSE_CONVENTIONS_MODE = mode;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.FUSE_CONVENTIONS_MODE;
    else process.env.FUSE_CONVENTIONS_MODE = prev;
  }
}

function withMaxLines<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.FUSE_SOLID_MAX_LINES;
  if (value === undefined) delete process.env.FUSE_SOLID_MAX_LINES;
  else process.env.FUSE_SOLID_MAX_LINES = value;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.FUSE_SOLID_MAX_LINES;
    else process.env.FUSE_SOLID_MAX_LINES = prev;
  }
}

test("routeTree.gen.ts: hard block (generated artifact) in both modes", () => {
  for (const mode of [undefined, "deny"]) {
    const p = withMode(mode, () => frameworkSolidGate("/p/src/routeTree.gen.ts", "export const routeTree = 1;"));
    expect(p?.kind).toBe("block");
    expect(p?.reason).toContain("routeTree.gen.ts");
  }
});

test("hook outside hooks/ — widened syntaxes: advisory default, deny on flag", () => {
  const src = "export default function useTheme() {\n  return 'dark';\n}\n";
  const advisory = withMode("advisory", () => frameworkSolidGate("/p/modules/u/src/theme.ts", src));
  expect(advisory?.kind).toBe("inform");
  expect(advisory?.reason).toContain("src/hooks/");
  const deny = withMode("deny", () => frameworkSolidGate("/p/modules/u/src/theme.ts", src));
  expect(deny?.kind).toBe("block");
});

test("legacy react hook rule stays hard deny (byte-parity)", () => {
  const src = "export function useAuth() {\n  return null;\n}\n";
  const p = withMode(undefined, () => frameworkSolidGate("/p/modules/u/src/auth.ts", src));
  expect(p?.kind).toBe("block");
  expect(p?.reason).toContain("hooks/");
});

test("hook file over its budget: advisory then deny (budget = 0.3 × global limit)", () => {
  const src = Array.from({ length: 35 }, (_, i) => `const v${i} = ${i};`).join("\n") + "\nexport const x = 1;";
  expect(countFrameworkCodeLines(src)).toBeGreaterThan(30);
  const advisory = withMode("advisory", () => withMaxLines("100", () => frameworkSolidGate("/p/modules/u/src/hooks/useBig.ts", src)));
  expect(advisory?.kind).toBe("inform");
  expect(advisory?.reason).toContain("(limit: 30)");
  const deny = withMode("deny", () => withMaxLines("100", () => frameworkSolidGate("/p/modules/u/src/hooks/useBig.ts", src)));
  expect(deny?.kind).toBe("block");
});

test("hook budget derives from FUSE_SOLID_MAX_LINES: 80 → 24, absent var → 30", () => {
  const src26 = Array.from({ length: 26 }, (_, i) => `const v${i} = ${i};`).join("\n") + "\nexport const x = 1;";
  expect(countFrameworkCodeLines(src26)).toBe(27);
  // 0.3 × 80 = 24 → 26 lines exceed it.
  const at80 = withMaxLines("80", () => frameworkSolidGate("/p/modules/u/src/hooks/useBig.ts", src26));
  expect(at80?.reason).toContain("(limit: 24)");
  // Variable absent → global default 100 → budget 30 → 26 lines pass.
  const atDefault = withMaxLines(undefined, () => frameworkSolidGate("/p/modules/u/src/hooks/useBig.ts", src26));
  expect(atDefault).toBeNull();
});

test("tanstack route with an interface: advisory; plain route: allow", () => {
  const route = "import { createFileRoute } from '@tanstack/react-router';\nexport interface Foo { x: number }\nexport const Route = createFileRoute('/')({ component: Home });";
  const p = withMode("advisory", () => frameworkSolidGate("/p/src/routes/index.tsx", route));
  expect(p?.kind).toBe("inform");
  expect(p?.reason).toContain("routing-only");
  const clean = "import { createFileRoute } from '@tanstack/react-router';\nexport const Route = createFileRoute('/')({ component: Home });";
  expect(withMode(undefined, () => frameworkSolidGate("/p/src/routes/index.tsx", clean))).toBeNull();
});
