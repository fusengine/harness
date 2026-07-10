import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { isBypassPermissions } from "../src/adapters/codex/permission-mode";
import { handleHook, type HandleOptions } from "../src/runtime/handle";

// Regression pin for codex-rs/core/src/hook_runtime.rs::hook_permission_mode:
// AskForApproval::Never -> "bypassPermissions" is the only value that isolates
// `never` (the other 3 approval policies all collapse to "default"). If OpenAI
// changes this mapping, this assertion is where to look.
test("isBypassPermissions: exact match on the pinned mapping string", () => {
  expect(isBypassPermissions("bypassPermissions")).toBe(true);
});

test("isBypassPermissions: undefined and the other approval policies' \"default\" are false", () => {
  expect(isBypassPermissions(undefined)).toBe(false);
  expect(isBypassPermissions("default")).toBe(false);
});

test("isBypassPermissions: no fuzzy matching — case/substring/whitespace near-misses fail closed", () => {
  expect(isBypassPermissions("BypassPermissions")).toBe(false);
  expect(isBypassPermissions("bypassPermissions ")).toBe(false);
  expect(isBypassPermissions("xbypassPermissions")).toBe(false);
  expect(isBypassPermissions("bypassPermissionsX")).toBe(false);
});

test("handlePre wiring: neverApproval fires for codex+Bash+bypassPermissions, never for claude-code", async () => {
  const opts: HandleOptions = { now: 1000, cwd: mkdtempSync(join(tmpdir(), "fh-perm-")) };
  const event = { hook_event_name: "PreToolUse", session_id: "s-perm", tool_name: "Bash", tool_input: { command: "git commit -m x" }, permission_mode: "bypassPermissions" };
  const codexOut = await handleHook("codex", event, opts);
  expect(codexOut.stdout).toContain("Auto-approved");
  const claudeOut = await handleHook("claude-code", event, { ...opts, cwd: mkdtempSync(join(tmpdir(), "fh-perm-")) });
  expect(JSON.parse(claudeOut.stdout).hookSpecificOutput.permissionDecision).toBe("ask");
});
