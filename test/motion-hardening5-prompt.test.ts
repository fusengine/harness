import { afterEach, expect, test } from "bun:test";
import { appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { makeFixture, run, bash, prompt, codeOf, type MotionFixture } from "./motion-handle-fixture";

const fixtures: MotionFixture[] = [];
afterEach(() => { for (const f of fixtures.splice(0)) rmSync(f.base, { recursive: true, force: true }); });

test("approval prompt surfaces state invalidation as native context without refusing owner input", async () => {
  const f = makeFixture(); fixtures.push(f);
  const denied = await run(f, bash("prompt5", "bash render.sh --stage draft"));
  appendFileSync(join(f.proj, ".motion/project.json"), "\n");
  const out = await run(f, prompt("prompt5", `MOTION-APPROVE stills ${codeOf(denied)}`));
  expect(out).toContain("all approvals invalidated");
  expect(out).toContain("additionalContext");
  expect(out).not.toContain('"permissionDecision":"deny"');
});
