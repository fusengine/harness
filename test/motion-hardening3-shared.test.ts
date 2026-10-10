import { expect, test } from "bun:test";
import { isUnder } from "../src/policy/motion/paths";
import { MOTION_WRITE_TOOLS } from "../src/policy/motion/constants";
import { MOTION_STORE_FRAGMENT } from "../src/policy/motion/store";
import { PROTECTED_FRAGMENTS } from "../src/policy/guards/protected-path";

test("12: path containment keeps exact directory boundaries", () => {
  expect(isUnder("/tmp/review", "/tmp/review")).toBe(true);
  expect(isUnder("/tmp/review/a", "/tmp/review")).toBe(true);
  expect(isUnder("/tmp/review/a", "/tmp/review/")).toBe(true);
  expect(isUnder("/tmp/review-evil/a", "/tmp/review")).toBe(false);
});
test("12: shared writer tools include canonical apply_patch", () => {
  expect([...MOTION_WRITE_TOOLS]).toEqual(["Write", "Edit", "MultiEdit", "NotebookEdit", "apply_patch"]);
});
test("12: protected fragment retains its exact trailing-slash behavior", () => {
  expect(`${MOTION_STORE_FRAGMENT}/`).toBe(".fuse-harness/motion/");
  expect(PROTECTED_FRAGMENTS.filter((s) => s.includes("motion"))).toEqual([".fuse-harness/motion/", ".fuse-harness/motion-keys/"]);
});
