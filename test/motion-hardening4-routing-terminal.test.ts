import { afterEach, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { makeFixture, run, bash, type MotionFixture } from "./motion-handle-fixture";
import { loadBudget } from "../src/policy/motion/budget";
import { canonicalRoot } from "../src/runtime/prd/prd-canon";

const fixtures: MotionFixture[] = [];
afterEach(() => { for (const f of fixtures.splice(0)) rmSync(f.base, { recursive: true, force: true }); });

test("terminal native identity chooses its reserved project despite different cwd and absent command", async () => {
  const a = makeFixture(), b = makeFixture(); fixtures.push(a, b);
  b.home = a.home;
  await run(a, bash("routing-terminal", "bash render.sh --stage stills", { tool_use_id: "reserved-a" }));
  await run(b, bash("routing-terminal", "ls"));
  expect(Object.keys(loadBudget(canonicalRoot(a.proj), a.home).inflight)).toHaveLength(1);
  await run(b, { hook_event_name: "PostToolUse", session_id: "routing-terminal", tool_use_id: "reserved-a", tool_name: "Bash", tool_input: {} });
  expect(loadBudget(canonicalRoot(a.proj), a.home).inflight).toEqual({});
  expect(loadBudget(canonicalRoot(a.proj), a.home).renders.stills).toBe(1);
  expect(loadBudget(canonicalRoot(b.proj), a.home).renders.stills).toBeUndefined();
});

test("ambiguous native identity cannot settle either project", async () => {
  const a = makeFixture(), b = makeFixture(); fixtures.push(a, b);
  b.home = a.home;
  const pre = bash("ambiguous", "bash render.sh --stage stills", { tool_use_id: "duplicate-host-id" });
  await run(a, pre);
  await run(b, pre);
  const out = await run(b, { ...pre, hook_event_name: "PostToolUse" });
  expect(out).toContain("ambiguous across projects");
  expect(Object.keys(loadBudget(canonicalRoot(a.proj), a.home).inflight)).toHaveLength(1);
  expect(Object.keys(loadBudget(canonicalRoot(b.proj), a.home).inflight)).toHaveLength(1);
  expect(loadBudget(canonicalRoot(a.proj), a.home).renders.stills).toBeUndefined();
  expect(loadBudget(canonicalRoot(b.proj), a.home).renders.stills).toBeUndefined();
});
