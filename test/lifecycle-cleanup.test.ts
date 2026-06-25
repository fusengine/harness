import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { removeOldFiles, trimLogFile, purgeTtlTree } from "../src/runtime/fs-cleanup";

const root = (): string => mkdtempSync(join(tmpdir(), "fh-clean-"));

test("removeOldFiles: deletes only matching files past the TTL", () => {
  const d = root();
  const old = join(d, "session-a.json");
  const fresh = join(d, "session-b.json");
  writeFileSync(old, "{}");
  writeFileSync(fresh, "{}");
  const past = Date.now() / 1000 - 100000;
  utimesSync(old, past, past);
  removeOldFiles(d, (n) => n.startsWith("session-"), 86400, Date.now());
  expect(existsSync(old)).toBe(false);
  expect(existsSync(fresh)).toBe(true);
});

test("trimLogFile: keeps only the last N lines when over budget", () => {
  const d = root();
  const f = join(d, "hooks.log");
  writeFileSync(f, Array.from({ length: 100 }, (_, i) => `line${i}`).join("\n"));
  trimLogFile(f, 1, 5);
  expect(readFileSync(f, "utf-8").split("\n").length).toBe(5);
});

test("purgeTtlTree: purges only whitelisted subtrees past TTL", () => {
  const base = root();
  mkdirSync(join(base, "sessions"), { recursive: true });
  mkdirSync(join(base, "lessons"), { recursive: true });
  const purgeable = join(base, "sessions", "old.json");
  const kept = join(base, "lessons", "keep.json");
  writeFileSync(purgeable, "{}");
  writeFileSync(kept, "{}");
  const past = Date.now() / 1000 - 999999;
  utimesSync(purgeable, past, past);
  utimesSync(kept, past, past);
  purgeTtlTree(base, { sessions: 48 * 3600 }, Date.now());
  expect(existsSync(purgeable)).toBe(false);
  expect(existsSync(kept)).toBe(true);
});
