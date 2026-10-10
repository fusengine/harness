import { expect, test } from "bun:test";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { budgetLine, loadBudget, openRender } from "../src/policy/motion/budget";
import { projectStoreDir } from "../src/policy/motion/store";
import { bash, isDeny, makeFixture, run } from "./motion-handle-fixture";

test("5: corrupt counters never reverse a runtime approval refusal", async () => {
  const fx = makeFixture(), dir = projectStoreDir(realpathSync(fx.proj), fx.home);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "budget.json"), '{"renders":{"stills":{"toString":1}}}');
  expect(isDeny(await run(fx, bash("corrupt", "bash render.sh --stage draft")))).toBe(true);
});

test("5: corrupt budgets deny admissions including uncapped and id-less renders", () => {
  const fx = makeFixture(), root = realpathSync(fx.proj), dir = projectStoreDir(root, fx.home);
  mkdirSync(dir, { recursive: true });
  for (const raw of ['{bad', '{}', '{"renders":{"stills":{"toString":1}}}',
    '{"renders":{"draft":-1},"wallMs":{},"inflight":{}}',
    '{"renders":{},"wallMs":{"draft":{}},"inflight":{}}',
    '{"renders":{},"wallMs":{},"inflight":{"x":null}}']) {
    writeFileSync(join(dir, "budget.json"), raw);
    expect(openRender(root, undefined, "stills", 1, fx.home, {})?.kind).toBe("block");
    expect(openRender(root, "id", "draft", 1, fx.home, {})?.kind).toBe("block");
  }
});

test("5: refusal diagnostics do not coerce corrupt counter objects", () => {
  const fx = makeFixture(), root = realpathSync(fx.proj), dir = projectStoreDir(root, fx.home);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "budget.json"), '{"renders":{"stills":{"toString":1}},"wallMs":{},"inflight":{}}');
  expect(() => budgetLine(loadBudget(root, fx.home), {})).not.toThrow();
});
