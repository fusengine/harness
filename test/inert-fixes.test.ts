import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { activityFor } from "../src/runtime/activity";
import { handleHook } from "../src/runtime/handle";
import { trackFile, defaultStateDir } from "../src/runtime/paths";
import { loadTrack } from "../src/tracking/store";

const root = (): string => mkdtempSync(join(tmpdir(), "fh-inert-"));
const task = (len?: number) =>
  activityFor({ tool: "Task", input: { subagent_type: "x:research-expert" }, sessionId: "s", framework: "g", now: 1, responseLength: len });

test("activityFor: agent quality derived from responseLength", () => {
  expect(task(600)).toEqual({ kind: "agent", name: "research-expert", ts: 1, quality: "sufficient" });
  const short = task(10);
  expect(short && short.kind === "agent" ? short.quality : null).toBe("insufficient");
  const none = task(undefined);
  expect(none && none.kind === "agent" ? "quality" in none : true).toBe(false);
});

test("handleHook: UserPromptSubmit sets brainstormRequired from creation intent", async () => {
  const cwd = root();
  const file = trackFile("s1", defaultStateDir(cwd));
  await handleHook("claude-code", { session_id: "s1", prompt: "create a new dashboard component" }, { now: 1, cwd });
  expect((await loadTrack(file)).brainstormRequired).toBe(true);
  await handleHook("claude-code", { session_id: "s1", prompt: "fix the login bug" }, { now: 2, cwd });
  expect((await loadTrack(file)).brainstormRequired).toBe(false);
});
