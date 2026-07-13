import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dryGate } from "../src/runtime/dry";
import { frameworkSkillGate } from "../src/runtime/framework-skill-gate";
import type { GateInput } from "../src/runtime/gate-input";
// Single source of truth for the SOLID line ceiling (`FUSE_SOLID_MAX_LINES` ?? default) — reused by fixtures below.
import { resolveMaxLines } from "../src/config/limits";

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

test("dryGate: exactly 3 duplicates -> block WITHOUT a '(+N more)' suffix (boundary)", () => {
  const cwd = tmp();
  writeFileSync(join(cwd, "e1.ts"), decl(1));
  writeFileSync(join(cwd, "e2.ts"), decl(2));
  writeFileSync(join(cwd, "e3.ts"), decl(3));
  const p = dryGate("Write", join(cwd, "new-file.ts"), decl(4), cwd);
  expect(p?.kind).toBe("block");
  expect(p?.reason).not.toContain("more)");
});

test("dryGate: 4 duplicates -> block truncates to 3 files with a '(+1 more)' suffix (parity detect_duplication.py)", () => {
  const cwd = tmp();
  writeFileSync(join(cwd, "e1.ts"), decl(1));
  writeFileSync(join(cwd, "e2.ts"), decl(2));
  writeFileSync(join(cwd, "e3.ts"), decl(3));
  writeFileSync(join(cwd, "e4.ts"), decl(4));
  const p = dryGate("Write", join(cwd, "new-file.ts"), decl(5), cwd);
  expect(p?.kind).toBe("block");
  expect(p?.reason).toContain("(+1 more)");
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
  // Tracks the gate's own resolver (`FUSE_SOLID_MAX_LINES` ?? default) so this
  // fixture stays oversized regardless of the ambient env override.
  const oversizedLines = resolveMaxLines() + 50;
  expect(frameworkSkillGate({ ...base, framework: "react" }, [], oversizedLines)).toBeNull();
  const p = frameworkSkillGate({ ...base, framework: "nextjs" }, [], oversizedLines);
  expect(p?.kind).toBe("block");
  expect(p?.title).toBe("SOLID violation");
});

test("frameworkSkillGate: existingCodeLines undefined -> no full-file max regardless of framework", () => {
  expect(frameworkSkillGate({ ...base, framework: "react" }, [])).toBeNull();
  expect(frameworkSkillGate({ ...base, framework: "nextjs" }, [])).toBeNull();
});
