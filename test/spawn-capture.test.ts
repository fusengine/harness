import { test, expect } from "bun:test";
import { spawnCapture } from "../src/util/runtime-io";

test("spawnCapture: success returns stdout", () => {
  expect(spawnCapture("echo", ["hi"], process.cwd()).trim()).toBe("hi");
});

test("spawnCapture: non-zero / missing binary still yield \"\"", () => {
  expect(spawnCapture("false", [], process.cwd())).toBe("");
  expect(spawnCapture("definitely-not-a-binary-xyz", [], process.cwd())).toBe("");
});

test("spawnCapture: a command outliving the timeout returns \"\" promptly (RED before: blocks for the full sleep)", () => {
  const t0 = Date.now();
  expect(spawnCapture("sleep", ["5"], process.cwd(), 300)).toBe("");
  expect(Date.now() - t0).toBeLessThan(2000);
});

test("spawnCapture: stdin is ignored (a stdin reader gets EOF, never hangs)", () => {
  const t0 = Date.now();
  expect(spawnCapture("cat", [], process.cwd(), 3000)).toBe("");
  expect(Date.now() - t0).toBeLessThan(2000);
});
