import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sha256File } from "../src/policy/motion/hash";

test("15: FIFO and devices refuse immediately instead of hanging the hook", () => {
  const path = join(mkdtempSync(join(tmpdir(), "motion-fifo-")), "artifact");
  expect(spawnSync("mkfifo", [path], { timeout: 1000 }).status).toBe(0);
  for (const file of [path, "/dev/zero"]) {
    const script = `import {sha256File} from ${JSON.stringify(resolve("src/policy/motion/hash.ts"))}; console.log(sha256File(${JSON.stringify(file)}));`;
    const result = spawnSync(process.execPath, ["--eval", script], { timeout: 1000, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("null");
  }
}, 4000);

test("15: sparse regular artifact above 256 MiB hashes within a few seconds", () => {
  const file = join(mkdtempSync(join(tmpdir(), "motion-big-")), "artifact");
  writeFileSync(file, "");
  truncateSync(file, 257 * 1024 * 1024);
  const start = performance.now();
  expect(sha256File(file)).not.toBeNull();
  expect(performance.now() - start).toBeLessThan(3000);
});

test("15: non-sparse 64 MiB regular artifact matches the reference SHA-256 digest", () => {
  const file = join(mkdtempSync(join(tmpdir(), "motion-data-")), "artifact");
  const content = Buffer.alloc(64 * 1024 * 1024, 7);
  writeFileSync(file, content);
  const expected = createHash("sha256").update(content).digest("hex");
  expect(sha256File(file)).toBe(expected);
});

test("15: hashing source has no arbitrary artifact-size or elapsed-time cap", () => {
  const source = readFileSync(resolve("src/policy/motion/hash.ts"), "utf8");
  expect(source).not.toMatch(/Date\.now|performance\.now|deadline|MAX_MOTION_ARTIFACT_BYTES|setTimeout|setInterval/);
  expect(source).not.toMatch(/before\.size\s*(?:[<>]=?|===?)\s*(?:\d|[A-Z_][A-Z_\d]*)/);
});
