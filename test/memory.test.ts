import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { stateFileFor, lessonsFileFor, readState, setStateField, throttleMs, nowStamp } from "../src/memory/state";
import { registryFile, readRoots, addRoot } from "../src/memory/registry";

test("readState: missing file -> zeros", () => {
  expect(readState("/no/such/file.json")).toEqual({ lastRemindedAt: 0, lastCodeEditAt: 0 });
});

test("setStateField: round-trip without clobbering sibling", () => {
  const file = join(mkdtempSync(join(tmpdir(), "fh-")), "MEMORY", "state.json");
  setStateField(file, "lastCodeEditAt", 111);
  setStateField(file, "lastRemindedAt", 222);
  expect(readState(file)).toEqual({ lastCodeEditAt: 111, lastRemindedAt: 222 });
});

test("stateFileFor + lessonsFileFor under .harness/memory", () => {
  expect(stateFileFor("/a/b")).toBe("/a/b/.harness/memory/state.json");
  expect(lessonsFileFor("/a/b")).toBe("/a/b/.harness/memory/LESSON.md");
});

test("throttleMs: default / override / bad -> default", () => {
  expect(throttleMs({})).toBe(5 * 60_000);
  expect(throttleMs({ FUSE_LESSONS_THROTTLE_MIN: "10" })).toBe(10 * 60_000);
  expect(throttleMs({ FUSE_LESSONS_THROTTLE_MIN: "x" })).toBe(5 * 60_000);
});

test("nowStamp: YYYY-MM-DD HH:MM", () => {
  expect(nowStamp()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

test("registry: addRoot dedups, readRoots reads, bad home -> null", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-home-"));
  expect(readRoots(home)).toEqual([]);
  addRoot("/proj/a", home);
  addRoot("/proj/a", home);
  addRoot("/proj/b", home);
  expect(readRoots(home).sort()).toEqual(["/proj/a", "/proj/b"]);
  expect(registryFile("")).toBeNull();
  expect(registryFile("relative")).toBeNull();
});
