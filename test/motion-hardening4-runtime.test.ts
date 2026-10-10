import { afterEach, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { makeFixture, run, bash, prompt, codeOf, type MotionFixture } from "./motion-handle-fixture";
import { loadBudget } from "../src/policy/motion/budget";
import { canonicalRoot } from "../src/runtime/prd/prd-canon";

const fixtures: MotionFixture[] = [];
afterEach(() => { for (const f of fixtures.splice(0)) rmSync(f.base, { recursive: true, force: true }); });

test("owner can grant child-project pending approval from parent cwd", async () => {
  const f = makeFixture(); fixtures.push(f);
  const denied = await run(f, bash("parent", "bash render.sh --stage draft"));
  const out = await run(f, prompt("parent", `MOTION-APPROVE stills ${codeOf(denied)}`), "motion", f.base);
  expect(out).toContain("approved for");
});

test("tool failure releases the exact render reservation without counting", async () => {
  const f = makeFixture(); fixtures.push(f);
  await run(f, bash("failed", "bash render.sh --stage stills"));
  expect(Object.keys(loadBudget(canonicalRoot(f.proj), f.home).inflight)).toHaveLength(1);
  await run(f, { ...bash("failed", "bash render.sh --stage stills"), hook_event_name: "PostToolUseFailure", error: "cancelled" });
  expect(loadBudget(canonicalRoot(f.proj), f.home).inflight).toEqual({});
  expect(loadBudget(canonicalRoot(f.proj), f.home).renders.stills).toBeUndefined();
});
