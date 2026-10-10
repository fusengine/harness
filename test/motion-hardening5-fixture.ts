import { expect } from "bun:test";
import { writeFileSync } from "node:fs";
import { bash, codeOf, isDeny, prompt, run, type MotionFixture } from "./motion-handle-fixture";

/** Establish a legitimate completed draft without approving it for master. */
export async function completeDraft(fx: MotionFixture, stillsApproved: boolean = false): Promise<void> {
  const pre = bash("fixture-draft5", "bash render.sh --stage draft", { tool_use_id: "fixture-render5" });
  if (!stillsApproved) {
    const denied = await run(fx, pre);
    expect(isDeny(denied)).toBe(true);
    expect(await run(fx, prompt("fixture-draft5", `MOTION-APPROVE stills ${codeOf(denied)}`))).toContain("approved");
  }
  expect(isDeny(await run(fx, pre))).toBe(false);
  writeFileSync(fx.draft, "fixture-authorized-draft5");
  expect(await run(fx, { ...pre, hook_event_name: "PostToolUse" })).not.toContain("quarantin");
}
