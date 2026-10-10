import { test, expect } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rootKey, sha256File } from "../src/policy/motion/hash";
import { findMotionRoot, loadMotionProject } from "../src/policy/motion/project";

const tmp = (): string => realpathSync(mkdtempSync(join(tmpdir(), "motion-hp-")));
const ref = (b: Buffer | string): string => createHash("sha256").update(b).digest("hex");

test("sha256File equals the reference digest", () => {
  const f = join(tmp(), "a.bin");
  writeFileSync(f, "hello motion");
  expect(sha256File(f)).toBe(ref("hello motion"));
});

test("sha256File chunks files larger than 1 MiB", () => {
  const f = join(tmp(), "big.bin");
  const big = Buffer.alloc(2 * 1024 * 1024 + 123, 7);
  big[1024 * 1024] = 1;
  writeFileSync(f, big);
  expect(sha256File(f)).toBe(ref(big));
});

test("sha256File: empty file hashes, absent file and directory give null", () => {
  const d = tmp();
  writeFileSync(join(d, "e"), "");
  expect(sha256File(join(d, "e"))).toBe(ref(""));
  expect(sha256File(join(d, "nope"))).toBeNull();
  expect(sha256File(d)).toBeNull();
});

test("rootKey is stable, 16 hex, and root-specific", () => {
  expect(rootKey("/a/b")).toMatch(/^[0-9a-f]{16}$/);
  expect(rootKey("/a/b")).toBe(rootKey("/a/b"));
  expect(rootKey("/a/b")).not.toBe(rootKey("/a/c"));
});

test("findMotionRoot walks up to the dir holding .motion", () => {
  const root = tmp();
  mkdirSync(join(root, ".motion"));
  mkdirSync(join(root, "src", "deep"), { recursive: true });
  const home = tmp();
  expect(findMotionRoot(join(root, "src", "deep"), home)).toBe(root);
  expect(findMotionRoot(root, home)).toBe(root);
});

test("findMotionRoot: null outside a project", () => {
  expect(findMotionRoot(tmp(), tmp())).toBeNull();
});

test("findMotionRoot ignores the OS home itself", () => {
  const home = tmp();
  mkdirSync(join(home, ".motion"));
  const proj = join(home, "work");
  mkdirSync(proj);
  expect(findMotionRoot(proj, home)).toBeNull();
  mkdirSync(join(proj, ".motion"));
  expect(findMotionRoot(proj, home)).toBe(proj);
});

test("findMotionRoot ignores home even when reached through a symlink", () => {
  const home = tmp();
  mkdirSync(join(home, ".motion"));
  const alias = join(tmp(), "alias");
  symlinkSync(home, alias);
  expect(findMotionRoot(home, alias)).toBeNull();
  expect(findMotionRoot(alias, home)).toBeNull();
});

test("loadMotionProject: null outside a project", () => {
  expect(loadMotionProject(tmp(), tmp())).toBeNull();
});

function project(json: string | null): { root: string; home: string } {
  const root = tmp();
  mkdirSync(join(root, ".motion"));
  if (json !== null) writeFileSync(join(root, ".motion", "project.json"), json);
  return { root, home: tmp() };
}

test("project.json absent or corrupt -> defaults", () => {
  for (const json of [null, "{not json", "[1,2]", "42"]) {
    const { root, home } = project(json);
    const p = loadMotionProject(root, home);
    expect(p).toEqual({
      root,
      render: undefined,
      draft: undefined,
      masters: [],
      sourceDir: root,
      reviewDir: join(root, ".motion", "review"),
      contact: join(root, ".motion", "stills", "contact.png"),
    });
  }
});

test("`master` string and `masters` array/string all resolve to absolute paths", () => {
  const a = project(JSON.stringify({ master: "out/m.mp4" }));
  expect(loadMotionProject(a.root, a.home)?.masters).toEqual([join(a.root, "out/m.mp4")]);
  const b = project(JSON.stringify({ masters: ["out/a.mp4", "out/b.mp4", 5, ""] }));
  expect(loadMotionProject(b.root, b.home)?.masters).toEqual([join(b.root, "out/a.mp4"), join(b.root, "out/b.mp4")]);
  const c = project(JSON.stringify({ masters: "out/c.mp4" }));
  expect(loadMotionProject(c.root, c.home)?.masters).toEqual([join(c.root, "out/c.mp4")]);
});

test("`masters` array and `master` string are merged (fail closed)", () => {
  const { root, home } = project(JSON.stringify({ masters: ["a.mp4"], master: "b.mp4" }));
  expect(loadMotionProject(root, home)?.masters).toEqual([join(root, "a.mp4"), join(root, "b.mp4")]);
});

test("render/draft/sourceDir/reviewDir are resolved; absolute paths kept", () => {
  const { root, home } = project(JSON.stringify({ render: "bun scripts/render.ts", draft: "out/d.mp4", sourceDir: "src", reviewDir: "/abs/review" }));
  const p = loadMotionProject(root, home);
  expect(p?.render).toBe("bun scripts/render.ts");
  expect(p?.draft).toBe(join(root, "out/d.mp4"));
  expect(p?.sourceDir).toBe(join(root, "src"));
  expect(p?.reviewDir).toBe("/abs/review");
});
