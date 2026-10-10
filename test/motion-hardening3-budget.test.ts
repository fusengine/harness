import { expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { openRender, loadBudget } from "../src/policy/motion/budget";
import { makeFixture } from "./motion-handle-fixture";

test("23: reused invocation id cannot silently replace another stage reservation", () => {
  const f = makeFixture(), root = realpathSync(f.proj);
  expect(openRender(root, "same", "stills", 1, f.home, {})).toBeNull();
  expect(openRender(root, "same", "draft", 2, f.home, {})?.kind).toBe("block");
  expect(openRender(root, "unique", "draft", 2, f.home, {})).toBeNull();
  expect(loadBudget(root, f.home).inflight.same).toEqual({ stage: "stills", ts: 1 });
});
