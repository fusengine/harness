import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dispatchLifecycle } from "../src/runtime/lifecycle";
import { saveSessionState } from "../src/runtime/home-state";
import { validateTaskSolid } from "../src/runtime/lifecycle/task-completed";
import { resolveMaxLines } from "../src/config/limits";

const tmp = (): string => mkdtempSync(join(tmpdir(), "fh-b4-taskcompleted-"));

test("dispatch: TaskCompleted is handled under the core scope (core-guards `hook claude-code` wiring)", () => {
  // core-guards/hooks/hooks.json now subscribes TaskCompleted with `hook claude-code`
  // and NO scope arg -> bin.ts defaults scope to "core". A non-null return proves
  // dispatchLifecycle routes the event to validateTaskSolid instead of falling
  // through to the tool-use pipeline (the bug: with no hooks.json subscription,
  // this gate never ran at all).
  const out = dispatchLifecycle({
    event: "TaskCompleted",
    payload: { session_id: "fh-b4-no-such-session" },
    cwd: tmp(),
    scope: "core",
    now: Date.now(),
  });
  expect(out).not.toBeNull();
  expect(out).toBe(""); // unknown session -> no tracked changes -> handled, silent
});

test("validateTaskSolid: oversized tracked file yields a TaskCompleted additionalContext", () => {
  // Parity with validate-task-solid.py: the emitted stdout must be a native
  // hookSpecificOutput context (adapter-rendered, not hardcoded in the gate).
  const home = tmp();
  const big = join(tmp(), "huge.ts");
  // Tracks the gate's own resolver (`FUSE_SOLID_MAX_LINES` ?? default) so this
  // fixture stays oversized regardless of the ambient env override.
  writeFileSync(big, "// line\n".repeat(resolveMaxLines() + 50));
  saveSessionState("b4s", { changes: { modifiedFiles: [big] } }, home);
  const out = validateTaskSolid({ session_id: "b4s", task_id: "t-b4", task_subject: "wire" }, home);
  const parsed = JSON.parse(out) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
  expect(parsed.hookSpecificOutput.hookEventName).toBe("TaskCompleted");
  expect(parsed.hookSpecificOutput.additionalContext).toContain("SOLID VIOLATION");
  expect(parsed.hookSpecificOutput.additionalContext).toContain("huge.ts");
});
