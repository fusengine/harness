import { afterEach, expect, test } from "bun:test";
import { existsSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { makeFixture, run, bash, prompt, codeOf, type MotionFixture } from "./motion-handle-fixture";
import { loadBudget } from "../src/policy/motion/budget";
import { canonicalRoot } from "../src/runtime/prd/prd-canon";
import { handleHook } from "../src/runtime/handle";

const fixtures: MotionFixture[] = [];
afterEach(() => { for (const f of fixtures.splice(0)) rmSync(f.base, { recursive: true, force: true }); });

test("unrelated Pre/Post/Stop leave an authorized active draft untouched until its terminal", async () => {
  const f = makeFixture(); fixtures.push(f);
  const denied = await run(f, bash("active5", "bash render.sh --stage draft"));
  await run(f, prompt("active5", `MOTION-APPROVE stills ${codeOf(denied)}`));
  const render = bash("active5", "bash render.sh --stage draft", { tool_use_id: "render5" });
  await run(f, render);
  writeFileSync(f.draft, "partial");
  for (const payload of [bash("active5", "ls", { tool_use_id: "other5" }), { ...bash("active5", "ls", { tool_use_id: "other5" }), hook_event_name: "PostToolUse" }, { hook_event_name: "Stop", session_id: "active5" }]) {
    expect(await run(f, payload)).not.toContain("quarantin");
    expect(existsSync(f.draft)).toBe(true);
  }
  expect(await run(f, { ...render, hook_event_name: "PostToolUse" })).not.toContain("quarantin");
});

test("runtime project-qualified no-id calls settle independently from parent cwd", async () => {
  const a = makeFixture(), b = makeFixture(); fixtures.push(a, b);
  b.home = a.home;
  const pre = { hook_event_name: "BeforeTool", session_id: "fallback5", tool_name: "run_shell_command", tool_input: { command: "cd proj && bash render.sh --stage stills" } };
  for (const f of [a, b]) await handleHook("gemini-cli", pre, { now: 1, cwd: f.base, home: f.home, scope: "motion" });
  const roots = [canonicalRoot(a.proj), canonicalRoot(b.proj)];
  const keys = roots.map((root) => Object.keys(loadBudget(root, a.home).inflight)[0]);
  expect(keys[0]).toBeDefined(); expect(keys[1]).toBeDefined(); expect(keys[0]).not.toBe(keys[1]);
  for (const f of [a, b]) expect((await handleHook("gemini-cli", { ...pre, hook_event_name: "AfterTool" }, { now: 2, cwd: f.base, home: f.home, scope: "motion" })).stdout).not.toContain("ambiguous");
  for (const root of roots) { expect(loadBudget(root, a.home).inflight).toEqual({}); expect(loadBudget(root, a.home).renders.stills).toBe(1); }
});

test("visible detach guard is wired after resolving a parent-cwd motion project", async () => {
  const f = makeFixture(); fixtures.push(f);
  expect(await run(f, bash("detach-integration5", "cd proj && nohup bash render.sh --stage stills"), "motion", f.base)).toContain('"permissionDecision":"deny"');
  expect(await run(f, bash("detach-integration5", "ls && cat .motion/project.json 2>&1"))).not.toContain('"permissionDecision":"deny"');
});

test("terminal success does not count a draft whose own output was removed", async () => {
  const f = makeFixture(); fixtures.push(f);
  const denied = await run(f, bash("removed5", "bash render.sh --stage draft"));
  await run(f, prompt("removed5", `MOTION-APPROVE stills ${codeOf(denied)}`));
  const render = bash("removed5", "bash render.sh --stage draft", { tool_use_id: "removed-render5" });
  await run(f, render); unlinkSync(f.draft);
  await run(f, { ...render, hook_event_name: "PostToolUse" });
  const budget = loadBudget(canonicalRoot(f.proj), f.home);
  expect(budget.renders.draft ?? 0).toBe(0);
  expect(budget.inflight).toEqual({});
});
