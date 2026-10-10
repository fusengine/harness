import { afterEach, expect, test } from "bun:test";
import { rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeFixture, run, bash, prompt, codeOf, type MotionFixture } from "./motion-handle-fixture";
import { completeDraft } from "./motion-hardening5-fixture";
import { loadBudget } from "../src/policy/motion/budget";
import { canonicalRoot } from "../src/runtime/prd/prd-canon";

const fixtures: MotionFixture[] = [];
afterEach(() => { for (const f of fixtures.splice(0)) rmSync(f.base, { recursive: true, force: true }); });

for (const explicit of [true, false]) test(`removed own master is not counted merely because another old master remains (${explicit ? "ffmpeg target" : "declared render"})`, async () => {
  const f = makeFixture(); fixtures.push(f);
  writeFileSync(join(f.proj, ".motion/project.json"), JSON.stringify({ render: "render.sh", draft: "out/draft.mp4", masters: ["out/master.mp4", "out/other.mp4"] }));
  writeFileSync(join(f.proj, "out/other.mp4"), "old-unrelated-master");
  await completeDraft(f);
  const command = explicit ? "ffmpeg -i out/draft.mp4 out/master.mp4" : "bash render.sh --stage master";
  const denied = await run(f, bash("own-master5", command));
  await run(f, prompt("own-master5", `MOTION-APPROVE draft ${codeOf(denied)}`));
  const pre = bash("own-master5", command, { tool_use_id: "own-master-target5" });
  await run(f, pre);
  writeFileSync(join(f.proj, "out/master.mp4"), "own-result");
  unlinkSync(join(f.proj, "out/master.mp4"));
  await run(f, { ...pre, hook_event_name: "PostToolUse" });
  const budget = loadBudget(canonicalRoot(f.proj), f.home);
  expect(budget.inflight).toEqual({});
  expect(budget.renders.master ?? 0).toBe(0);
});
