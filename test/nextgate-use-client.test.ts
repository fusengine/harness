import { test, expect } from "bun:test";
import { nextGate } from "../src/policy/framework-solid-gates";

// F1.1 (external audit): the 'use client' directive check ran on masked
// content — the directive is a string literal, so it was always "missing".
const HOOKED = "import { useState } from 'react';\nexport default function C() {\n  const [x] = useState(0);\n  return null;\n}";

test("F1.1: directive present (single quotes) + hooks -> clean", () => {
  const src = "'use client';\n" + HOOKED;
  expect(nextGate("app/components/C.tsx", src).some((v) => v.includes("'use client' directive missing"))).toBe(false);
});

test("F1.1: directive present (double quotes) + hooks -> clean", () => {
  const src = '"use client";\n' + HOOKED;
  expect(nextGate("app/components/C.tsx", src).some((v) => v.includes("'use client' directive missing"))).toBe(false);
});

test("F1.1: directive absent + hooks -> violation", () => {
  expect(nextGate("app/components/C.tsx", HOOKED).some((v) => v.includes("'use client' directive missing"))).toBe(true);
});

test("F1.1: directive in a COMMENT is not a directive -> violation", () => {
  const src = '// "use client"\n' + HOOKED;
  expect(nextGate("app/components/C.tsx", src).some((v) => v.includes("'use client' directive missing"))).toBe(true);
});
