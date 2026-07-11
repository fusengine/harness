import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { securityAdvisory, securityAdvisoryForPatch } from "../src/runtime/lifecycle/security/check-skill";

const home = (): string => mkdtempSync(join(tmpdir(), "fh-sec-adv-"));

test("securityAdvisory: renders as additionalContext only, never a naked permissionDecision:allow", () => {
  const out = securityAdvisory("Write", "src/widget.ts", 1000, home());
  expect(out).toContain("SECURITY");
  expect(out).toContain("additionalContext");
  expect(out).not.toContain("permissionDecision");
});

test("securityAdvisory: a non-code file never triggers the advisory", () => {
  expect(securityAdvisory("Write", "README.md", 1000, home())).toBe("");
});

test("securityAdvisory: a non Write/Edit tool never triggers the advisory", () => {
  expect(securityAdvisory("Read", "src/widget.ts", 1000, home())).toBe("");
});

test("securityAdvisoryForPatch: fires on the first qualifying add/update file", () => {
  const h = home();
  const out = securityAdvisoryForPatch(
    [
      { filePath: "README.md", content: "", op: "update" },
      { filePath: "src/a.ts", content: "", op: "add" },
      { filePath: "src/b.ts", content: "", op: "update" },
    ],
    1000,
    h,
  );
  expect(out).toContain("additionalContext");
});

test("securityAdvisoryForPatch: a delete op is ignored outright", () => {
  const h = home();
  const out = securityAdvisoryForPatch([{ filePath: "src/a.ts", content: "", op: "delete" }], 1000, h);
  expect(out).toBe("");
});

test("securityAdvisoryForPatch: only non-code files -> no advisory", () => {
  const h = home();
  const out = securityAdvisoryForPatch(
    [
      { filePath: "README.md", content: "", op: "update" },
      { filePath: "notes.txt", content: "", op: "add" },
    ],
    1000,
    h,
  );
  expect(out).toBe("");
});

test("securityAdvisoryForPatch: no files at all -> no advisory", () => {
  expect(securityAdvisoryForPatch([], 1000, home())).toBe("");
});
