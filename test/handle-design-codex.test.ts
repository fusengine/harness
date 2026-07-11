import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { designLifecycle } from "../src/runtime/design-lifecycle";
import { activeDesignAgent } from "../src/policy/design/flag";

const NOW = Date.UTC(2026, 5, 25, 12, 0, 0);

/** A fresh isolated dir (reused for both cacheDir and cwd args). */
function dir(): string {
  return mkdtempSync(join(tmpdir(), "fh-design-"));
}

test("designLifecycle: Codex SubagentStart with a design agent_type -> handled (true)", () => {
  const payload = { hook_event_name: "SubagentStart", agent_id: "codex-a1", agent_type: "fuse-design:design-expert" };
  expect(designLifecycle(payload, dir(), dir(), "stamp", NOW)).toBe(true);
});

test("designLifecycle: non-design agent_type -> not handled (false)", () => {
  const payload = { hook_event_name: "SubagentStart", agent_id: "codex-a1", agent_type: "explore-codebase" };
  expect(designLifecycle(payload, dir(), dir(), "stamp", NOW)).toBe(false);
});

test("designLifecycle: SubagentStart design agent but missing agent_id -> false", () => {
  const payload = { hook_event_name: "SubagentStart", agent_type: "design-system" };
  expect(designLifecycle(payload, dir(), dir(), "stamp", NOW)).toBe(false);
});

test("designLifecycle: unrelated event (SessionStart) -> false", () => {
  const payload = { hook_event_name: "SessionStart", agent_id: "a1", agent_type: "design-system" };
  expect(designLifecycle(payload, dir(), dir(), "stamp", NOW)).toBe(false);
});

test("designLifecycle: SubagentStop clears the active flag when agent_id matches (agent_type-independent)", () => {
  const cacheDir = dir();
  const start = { hook_event_name: "SubagentStart", agent_id: "codex-a1", agent_type: "fuse-design:design-expert" };
  expect(designLifecycle(start, cacheDir, dir(), "stamp", NOW)).toBe(true);
  expect(activeDesignAgent(cacheDir)).toBe("codex-a1");
  const stop = { hook_event_name: "SubagentStop", agent_id: "codex-a1" };
  expect(designLifecycle(stop, cacheDir, dir(), "stamp", NOW)).toBe(true);
  expect(activeDesignAgent(cacheDir)).toBe("");
});

test("designLifecycle: SubagentStop for a non-active agent_id -> false (no-op)", () => {
  expect(designLifecycle({ hook_event_name: "SubagentStop", agent_id: "ghost" }, dir(), dir(), "stamp", NOW)).toBe(false);
});
