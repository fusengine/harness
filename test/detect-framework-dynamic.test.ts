import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detectFramework } from "../src/policy/detect-framework";

/** Temp project dir whose package.json lists `deps` as dependencies. */
function project(deps: Record<string, string>, prefix = "fw-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: deps }));
  return dir;
}

/** Write `content` to `dir/rel` (creating parents) and return the abs path. */
function file(dir: string, rel: string, content: string): string {
  const p = join(dir, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, content);
  return p;
}

test("react project + App.tsx component -> react", () => {
  const dir = project({ react: "19.0.0", "react-dom": "19.0.0" });
  const f = file(dir, "src/App.tsx", "export const A = () => null;\n");
  expect(detectFramework(f, "export const A = () => null;")).toBe("react");
});

test("react project + backend db.ts with no react signal -> generic (the key win)", () => {
  const dir = project({ react: "19.0.0" });
  const f = file(dir, "src/db.ts", "export const q = 1;\n");
  expect(detectFramework(f, "export const q = 1;")).toBe("generic");
});

test("react project + hook.ts importing react -> react", () => {
  const dir = project({ react: "19.0.0" });
  const body = 'import { useState } from "react";\n';
  const f = file(dir, "src/hook.ts", body);
  expect(detectFramework(f, body)).toBe("react");
});

test("nested scripts/ package.json without react + x.test.ts -> generic (the reported bug)", () => {
  const dir = project({ react: "19.0.0" });
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(join(dir, "scripts", "package.json"), JSON.stringify({ dependencies: { chalk: "5" } }));
  const body = "test('x', () => {});\n";
  const f = file(dir, "scripts/x.test.ts", body);
  expect(detectFramework(f, body)).toBe("generic");
});

test(".php in a laravel project -> laravel", () => {
  const dir = mkdtempSync(join(tmpdir(), "fw-lar-"));
  writeFileSync(join(dir, "composer.json"), JSON.stringify({ require: { "laravel/framework": "^11" } }));
  writeFileSync(join(dir, "artisan"), "#!/usr/bin/env php\n");
  const f = file(dir, "app/User.php", "<?php class User {}\n");
  expect(detectFramework(f, "<?php class User {}")).toBe("laravel");
});

test(".tsx in a project without react -> generic", () => {
  const dir = project({ chalk: "5.0.0" }, "fw-noreact-");
  const f = file(dir, "src/Widget.tsx", "export const W = () => null;\n");
  expect(detectFramework(f, "export const W = () => null;")).toBe("generic");
});
