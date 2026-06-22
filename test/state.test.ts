import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { acquireLock } from "../src/state/lock";
import { stateFilePath, apexStateDir } from "../src/state/apex-state";
import { taskCreate, taskStart, taskComplete } from "../src/state/task-helpers";

test("acquireLock: acquires, blocks while held, re-acquires after release", async () => {
  const dir = join(mkdtempSync(join(tmpdir(), "fh-lock-")), "lock");
  const release = await acquireLock(dir, 1000);
  expect(release).not.toBeNull();
  expect(await acquireLock(dir, 300)).toBeNull();
  await release?.();
  const again = await acquireLock(dir, 1000);
  expect(again).not.toBeNull();
  await again?.();
});

test("stateFilePath + apexStateDir", () => {
  expect(apexStateDir("/h")).toBe("/h/.claude/logs/00-apex");
  expect(stateFilePath("/h", "2026-06-22")).toBe("/h/.claude/logs/00-apex/2026-06-22-state.json");
});

test("task-helpers: create -> start -> complete", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "fh-task-")), "task.json");
  writeFileSync(file, JSON.stringify({ current_task: "", created_at: "", tasks: {} }));
  await taskCreate(file, "t1", "Do X", "desc");
  await taskStart(file, "t1");
  await taskComplete(file, "t1");
  const data = JSON.parse(readFileSync(file, "utf8")) as { tasks: Record<string, { status: string; subject: string }> };
  expect(data.tasks.t1?.status).toBe("completed");
  expect(data.tasks.t1?.subject).toBe("Do X");
});
