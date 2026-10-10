import { afterEach, expect, test } from "bun:test";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeFixture, run, bash, prompt, codeOf, type MotionFixture } from "./motion-handle-fixture";
import { loadBudget } from "../src/policy/motion/budget";
import { canonicalRoot } from "../src/runtime/prd/prd-canon";
import { completeDraft } from "./motion-hardening5-fixture";

const fixtures: MotionFixture[] = [];
afterEach(() => { for (const f of fixtures.splice(0)) rmSync(f.base, { recursive: true, force: true }); });

for (const failure of [false, true]) test(`terminal ${failure ? "failure releases" : "success counts"} exactly once despite a quarantine message`, async () => {
  const f = makeFixture(); fixtures.push(f);
  await completeDraft(f);
  const denied = await run(f, bash("terminal", "bash render.sh --stage master"));
  await run(f, prompt("terminal", `MOTION-APPROVE draft ${codeOf(denied)}`));
  const pre = bash("terminal", "bash render.sh --stage master", { tool_use_id: "terminal-call" });
  await run(f, pre);
  expect(Object.keys(loadBudget(canonicalRoot(f.proj), f.home).inflight)).toHaveLength(1);
  writeFileSync(join(f.proj, "out/master.mp4"), "authorized-master");
  writeFileSync(f.draft, "unapproved-other-stage");
  const post = { ...pre, hook_event_name: failure ? "PostToolUseFailure" : "PostToolUse" };
  expect(await run(f, post)).toContain("quarantin");
  expect(existsSync(f.draft)).toBe(false);
  expect(existsSync(join(f.proj, "out/master.mp4"))).toBe(true);
  expect(loadBudget(canonicalRoot(f.proj), f.home).inflight).toEqual({});
  expect(loadBudget(canonicalRoot(f.proj), f.home).renders.master ?? 0).toBe(failure ? 0 : 1);
  await run(f, post);
  expect(loadBudget(canonicalRoot(f.proj), f.home).renders.master ?? 0).toBe(failure ? 0 : 1);
});
