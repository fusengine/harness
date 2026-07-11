import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { dispatchLifecycle, type LifecycleInput } from "../src/runtime/lifecycle/dispatch";

const NOW = Date.UTC(2026, 5, 25, 12, 0, 0);

/** A Stop LifecycleInput for `scope`, with a fresh isolated cwd. */
function stopInput(scope: LifecycleInput["scope"]): LifecycleInput {
  return { event: "Stop", payload: { session_id: "s1" }, cwd: mkdtempSync(join(tmpdir(), "fh-stop-")), scope, now: NOW };
}

test("dispatchLifecycle: Stop scope core -> string", () => {
  expect(typeof dispatchLifecycle(stopInput("core"))).toBe("string");
});

test("dispatchLifecycle: Stop scope seo -> null (unhandled scope)", () => {
  expect(dispatchLifecycle(stopInput("seo"))).toBeNull();
});

test("dispatchLifecycle: Stop scope lessons -> string", () => {
  expect(typeof dispatchLifecycle(stopInput("lessons"))).toBe("string");
});
