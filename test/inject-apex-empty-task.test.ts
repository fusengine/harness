import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { injectApexSubagentContext } from "../src/runtime/lifecycle/aipilot/inject-apex";

/** Project whose `<seg>/apex/task.json` holds `body` — reproduces the live Codex SubagentStart crash on `{}`. */
function project(seg: string, body: string): string {
  const cwd = mkdtempSync(join(tmpdir(), "fh-inj-"));
  mkdirSync(join(cwd, seg, "apex"), { recursive: true });
  writeFileSync(join(cwd, seg, "apex", "task.json"), body);
  return cwd;
}

test("task.json without `tasks` no longer throws — completed/pending fall back to none (codex + claude-code)", async () => {
  for (const [id, seg] of [["codex", ".codex"], ["claude-code", ".claude"]] as const) {
    const out = await injectApexSubagentContext(project(seg, "{}"), undefined, id);
    expect(out).toContain("none");
  }
});

test("non-regression: a valid task map still lists completed and pending tasks", async () => {
  const body = JSON.stringify({ tasks: { "1": { subject: "done-one", status: "completed", completed_at: "2026-01-01" }, "2": { subject: "todo-two", status: "pending" } } });
  const out = await injectApexSubagentContext(project(".claude", body), undefined, "claude-code");
  expect(out).toContain("done-one");
  expect(out).toContain("todo-two");
});
