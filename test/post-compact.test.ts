import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { postCompactContext } from "../src/runtime/lifecycle/post-compact";

test("postCompactContext: injects the compaction reminder as additionalContext", () => {
  const cwd = mkdtempSync(join(tmpdir(), "fh-compact-"));
  const out = postCompactContext({ session_id: "s1", trigger: "auto" }, cwd, import.meta.url, 1000);
  const ctx = (JSON.parse(out) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext;
  expect(ctx).toContain("Context was compacted");
});

test("postCompactContext: dedups within the window for the same session", () => {
  const cwd = mkdtempSync(join(tmpdir(), "fh-compact2-"));
  expect(postCompactContext({ session_id: "s2" }, cwd, import.meta.url, 1000)).not.toBe("");
  expect(postCompactContext({ session_id: "s2" }, cwd, import.meta.url, 1200)).toBe("");
});
