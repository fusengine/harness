import { afterEach, expect, spyOn, test } from "bun:test";
import { rmSync } from "node:fs";
import { makeFixture, run, bash, type MotionFixture } from "./motion-handle-fixture";
import * as store from "../src/policy/motion/store";
import { loadBudget } from "../src/policy/motion/budget";
import { readMotionState } from "../src/policy/motion/state";
import { canonicalRoot } from "../src/runtime/prd/prd-canon";

const fixtures: MotionFixture[] = [];
afterEach(() => { for (const f of fixtures.splice(0)) rmSync(f.base, { recursive: true, force: true }); });

for (const failingWrite of [1, 2]) test(`refused Pre compensates the reservation when reserved state write ${failingWrite} fails`, async () => {
  const f = makeFixture(); fixtures.push(f);
  await run(f, bash("transaction5", "ls"));
  const root = canonicalRoot(f.proj), original = store.writeJsonObject;
  let seen = 0;
  const failure = spyOn(store, "writeJsonObject").mockImplementation((path: string, data: object): void => {
    if (path.includes("/state/") && Object.keys(loadBudget(root, f.home).inflight).length && ++seen === failingWrite) throw Object.assign(new Error("fixture state write failure"), { code: "EIO" });
    original(path, data);
  });
  try {
    expect(await run(f, bash("transaction5", "bash render.sh --stage stills", { tool_use_id: "reserved5" }))).toContain('"permissionDecision":"deny"');
  } finally { failure.mockRestore(); }
  expect(loadBudget(root, f.home).inflight).toEqual({});
  expect(readMotionState(root, f.home)?.renders).toEqual({});
});

test("catch-path pending writes refresh the harness fingerprint", async () => {
  const f = makeFixture(); fixtures.push(f);
  await run(f, bash("pending5", "ls"));
  const original = store.writeJsonObject;
  let fail = true;
  const failure = spyOn(store, "writeJsonObject").mockImplementation((path: string, data: object): void => {
    if (path.includes("/state/") && fail) { fail = false; throw Object.assign(new Error("fixture state failure before gate"), { code: "EIO" }); }
    original(path, data);
  });
  try { expect(await run(f, bash("pending5", "bash render.sh --stage draft"))).toContain("MOTION-APPROVE stills"); }
  finally { failure.mockRestore(); }
  expect(await run(f, bash("pending5", "ls"))).not.toContain("invalidated");
});
