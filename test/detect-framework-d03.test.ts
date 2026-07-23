import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectFramework } from "../src/policy/detect-framework";

// D0.3 (external audit): content signals ride masked content — a comment
// mentioning createServerFn must not flip a real Next.js file to tanstack-start.
function project(deps: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "fh-d03-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: deps }));
  return dir;
}

test("D0.3: a comment citing createServerFn keeps the nextjs detection", () => {
  const dir = project({ next: "15", react: "19" });
  const page = "// migrated from createServerFn pattern\nexport default function Page() { return null; }";
  expect(detectFramework("app/page.tsx", page, dir)).toBe("nextjs");
});

test("D0.3: a real createFileRoute in code keeps the tanstack-start detection", () => {
  const dir = project({ react: "19", "@tanstack/react-start": "1" });
  const route = "import { createFileRoute } from '@tanstack/react-router';\nexport const Route = createFileRoute('/')({ component: Home });";
  expect(detectFramework("src/routes/index.tsx", route, dir)).toBe("tanstack-start");
});
