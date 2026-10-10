import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isRecordObject, recordObject } from "../src/util/record-object";

test("motion and shared payload readers reuse the record predicate", () => {
  for (const path of ["runtime/motion/host", "runtime/handle-payload", "policy/motion/budget", "policy/motion/store", "policy/motion/project", "policy/motion/state-witness"]) {
    const source = readFileSync(new URL(`../src/${path}.ts`, import.meta.url), "utf8");
    expect(source).toContain("util/record-object");
    expect(source).not.toMatch(/typeof \w+ === "object"/);
  }
});

test("record predicate preserves object identity and legacy array admission without prototype restrictions", () => {
  for (const object of [{}, Object.create(null), new Date(), /x/]) {
    expect(isRecordObject(object)).toBe(true);
    expect(recordObject(object)).toBe(object);
  }
  for (const value of [undefined, null, false, 0, "", () => {}]) {
    expect(isRecordObject(value)).toBe(false);
    expect(isRecordObject(value, true)).toBe(false);
    expect(recordObject(value)).toEqual({});
  }
  const array = ["legacy-witness"];
  expect(isRecordObject(array)).toBe(false);
  expect(isRecordObject(array, true)).toBe(true);
  expect(Object.is(recordObject(array, true), array)).toBe(true);
});
