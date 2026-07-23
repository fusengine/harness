import { test, expect } from "bun:test";
import { parseScope } from "../src/cli/scope";

test("parseScope: valid scopes pass through without a warning", () => {
  const warnings: string[] = [];
  expect(parseScope("solid", (m) => warnings.push(m))).toBe("solid");
  expect(parseScope("aipilot", (m) => warnings.push(m))).toBe("aipilot");
  expect(warnings).toEqual([]);
});

test("parseScope: unknown scope warns and falls back to core", () => {
  const warnings: string[] = [];
  expect(parseScope("my-plugin", (m) => warnings.push(m))).toBe("core");
  expect(warnings).toEqual(['harness: unknown scope "my-plugin", falling back to "core"\n']);
});

test("parseScope: absent scope defaults to core, silently", () => {
  const warnings: string[] = [];
  expect(parseScope(undefined, (m) => warnings.push(m))).toBe("core");
  expect(warnings).toEqual([]);
});

test("parseScope: explicit 'core' is accepted without a warning", () => {
  const warnings: string[] = [];
  expect(parseScope("core", (m) => warnings.push(m))).toBe("core");
  expect(warnings).toEqual([]);
});
