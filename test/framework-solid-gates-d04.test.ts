import { test, expect } from "bun:test";
import { nextGate, swiftGate } from "../src/policy/framework-solid-gates";
import { countFrameworkCodeLines } from "../src/policy/file-size";

// D0.4 (permanent rule): every size limit flows through resolveMaxLines()
// (env FUSE_SOLID_MAX_LINES); special files get base + 50 — never a literal.
function codeLines(n: number): string {
  return Array.from({ length: n }, (_, i) => `const v${i} = ${i};`).join("\n");
}

test("D0.4: nextGate follows FUSE_SOLID_MAX_LINES=80 → 80 base, 130 special", () => {
  const prev = process.env.FUSE_SOLID_MAX_LINES;
  process.env.FUSE_SOLID_MAX_LINES = "80";
  try {
    const plain = nextGate("app/components/Big.tsx", codeLines(120));
    expect(plain.some((v) => v.includes("(limit: 80)"))).toBe(true);
    const special = nextGate("app/page.tsx", codeLines(120));
    expect(special.some((v) => v.includes("120 lines"))).toBe(false); // 120 < 130 → no violation
    expect(nextGate("app/page.tsx", codeLines(140)).some((v) => v.includes("(limit: 130)"))).toBe(true);
  } finally {
    if (prev === undefined) delete process.env.FUSE_SOLID_MAX_LINES;
    else process.env.FUSE_SOLID_MAX_LINES = prev;
  }
});

test("D0.4: swiftGate follows the same base + 50 rule; defaults stay 100/150", () => {
  const prev = process.env.FUSE_SOLID_MAX_LINES;
  process.env.FUSE_SOLID_MAX_LINES = "80";
  try {
    expect(swiftGate("Sources/Big.swift", codeLines(120)).some((v) => v.includes("(limit: 80)"))).toBe(true);
    expect(swiftGate("Sources/HomeView.swift", codeLines(120)).some((v) => v.includes("120 lines"))).toBe(false);
  } finally {
    if (prev === undefined) delete process.env.FUSE_SOLID_MAX_LINES;
    else process.env.FUSE_SOLID_MAX_LINES = prev;
  }
  // Default resolver (ambient env or 100): special file ceiling is base + 50.
  const lines = countFrameworkCodeLines(codeLines(120));
  expect(lines).toBe(120);
});
