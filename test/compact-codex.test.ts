import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { saveApexState } from "../src/runtime/lifecycle/pre-compact";
import { postCompactContext } from "../src/runtime/lifecycle/post-compact";

/** Codex Pre/PostCompact accept only HookUniversalOutputWire keys (serde `deny_unknown_fields`). */
const CODEX_COMPACT_KEYS = new Set(["continue", "stopReason", "suppressOutput", "systemMessage"]);
const codexAccepts = (stdout: string): boolean =>
  stdout.trim() === "" || Object.keys(JSON.parse(stdout) as object).every((k) => CODEX_COMPACT_KEYS.has(k));

/** Project root with an APEX task.json under the harness home segment (".codex" or ".claude"). */
function project(seg: string): string {
  const cwd = mkdtempSync(join(tmpdir(), "fh-compact-"));
  mkdirSync(join(cwd, seg, "apex"), { recursive: true });
  writeFileSync(join(cwd, seg, "apex", "task.json"), "{}");
  return cwd;
}

test("codex PreCompact → systemMessage only, accepted by Codex's schema", () => {
  const out = saveApexState(project(".codex"), 1000, "codex");
  expect(codexAccepts(out)).toBe(true);
  expect((JSON.parse(out) as { systemMessage: string }).systemMessage).toContain("APEX state saved before compaction");
});

test("non-regression: claude-code PreCompact keeps the exact previous bytes", () => {
  expect(saveApexState(project(".claude"), 1000, "claude-code"))
    .toBe('{"additionalContext":"APEX state saved before compaction. Previous task state preserved in .claude/apex/backups/"}');
});

test("codex PostCompact → systemMessage only, accepted by Codex's schema", () => {
  const out = postCompactContext({ session_id: "pc-codex" }, mkdtempSync(join(tmpdir(), "fh-pc-")), import.meta.url, 1000, "codex");
  expect(codexAccepts(out)).toBe(true);
  expect((JSON.parse(out) as { systemMessage: string }).systemMessage).toContain("Context was compacted");
});

test("non-regression: default id PostCompact keeps hookSpecificOutput.additionalContext", () => {
  const out = postCompactContext({ session_id: "pc-claude" }, mkdtempSync(join(tmpdir(), "fh-pc-")), import.meta.url, 1000);
  const o = JSON.parse(out) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
  expect(o.hookSpecificOutput.hookEventName).toBe("PostCompact");
  expect(o.hookSpecificOutput.additionalContext).toContain("Context was compacted");
});
