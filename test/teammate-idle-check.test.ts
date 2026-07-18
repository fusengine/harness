import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { saveSessionState } from "../src/runtime/home-state";
import { teammateIdleContext } from "../src/runtime/lifecycle/teammate-idle-check";

test("teammateIdleContext: warns about announced files missing on disk", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-home-"));
  const cwd = mkdtempSync(join(tmpdir(), "fh-cwd-"));
  const present = join(cwd, "present.ts");
  writeFileSync(present, "x");
  const missing = join(cwd, "gone.ts");
  saveSessionState("s1", { changes: { cumulativeCodeFiles: 2, modifiedFiles: [present, missing] } }, home);
  const out = teammateIdleContext({ teammate_name: "tm", session_id: "s1" }, cwd, home, 1000);
  expect(out).toContain("gone.ts");
  expect(out).toContain("not found on disk");
});

test("teammateIdleContext: silent about deliverables when all announced files exist", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-home2-"));
  const cwd = mkdtempSync(join(tmpdir(), "fh-cwd2-"));
  const f = join(cwd, "a.ts");
  writeFileSync(f, "x");
  saveSessionState("s2", { changes: { cumulativeCodeFiles: 1, modifiedFiles: [f] } }, home);
  const out = teammateIdleContext({ teammate_name: "tm", session_id: "s2" }, cwd, home, 1000);
  expect(out).not.toContain("not found on disk");
});

test("teammateIdleContext: advisory systemMessage only — TeammateIdle rejects hookSpecificOutput", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-home3-"));
  const cwd = mkdtempSync(join(tmpdir(), "fh-cwd3-"));
  const missing = join(cwd, "gone.ts");
  saveSessionState("s3", { changes: { cumulativeCodeFiles: 1, modifiedFiles: [missing] } }, home);
  const out = teammateIdleContext({ teammate_name: "tm", session_id: "s3" }, cwd, home, 1000);
  const parsed = JSON.parse(out) as { systemMessage?: string; hookSpecificOutput?: unknown };
  expect(parsed.hookSpecificOutput).toBeUndefined();
  expect(parsed.systemMessage).toContain("gone.ts");
});
