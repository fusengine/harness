import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dryGate } from "../src/runtime/dry";
import { frameworkSkillGate } from "../src/runtime/framework-skill-gate";
import type { GateInput } from "../src/runtime/gate-input";

const tmp = (): string => mkdtempSync(join(tmpdir(), "fh-del-"));
const SYMBOL = "aVeryUniqueLongSymbolName";
const decl = (n: number): string => `export function ${SYMBOL}() { return ${n}; }\n`;

test("dryGate: 0 duplicates -> null", () => {
  const cwd = tmp();
  expect(dryGate("Write", join(cwd, "new-file.ts"), decl(0), cwd)).toBeNull();
});

test("dryGate: 1 duplicate -> inform (parity detect_duplication.py allow_pass)", () => {
  const cwd = tmp();
  writeFileSync(join(cwd, "existing.ts"), decl(1));
  const p = dryGate("Write", join(cwd, "new-file.ts"), decl(2), cwd);
  expect(p?.kind).toBe("inform");
  expect(p?.title).toBe("Possible duplicate code (DRY)");
});

test("dryGate: 2 duplicates -> block (unchanged)", () => {
  const cwd = tmp();
  writeFileSync(join(cwd, "existing.ts"), decl(1));
  writeFileSync(join(cwd, "existing2.ts"), decl(2));
  const p = dryGate("Edit", join(cwd, "new-file.ts"), decl(3), cwd);
  expect(p?.kind).toBe("block");
  expect(p?.title).toBe("Duplicate code (DRY)");
});

const base: GateInput = {
  sessionId: "s1",
  framework: "react",
  tool: "Edit",
  filePath: "src/utils/helper.ts",
  content: "export function helper(a: number): number {\n  return a + 1;\n}\n",
  now: Date.now(),
  trackFile: "/tmp/does-not-matter-track.json",
};

test("frameworkSkillGate: nextjs applies existingCodeLines full-file max, react does not", () => {
  expect(frameworkSkillGate({ ...base, framework: "react" }, [], 150)).toBeNull();
  const p = frameworkSkillGate({ ...base, framework: "nextjs" }, [], 150);
  expect(p?.kind).toBe("block");
  expect(p?.title).toBe("SOLID violation");
});

test("frameworkSkillGate: existingCodeLines undefined -> no full-file max regardless of framework", () => {
  expect(frameworkSkillGate({ ...base, framework: "react" }, [])).toBeNull();
  expect(frameworkSkillGate({ ...base, framework: "nextjs" }, [])).toBeNull();
});
