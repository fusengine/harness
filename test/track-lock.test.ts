import { test, expect } from "bun:test";
import { writeFileSync, utimesSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { withTrack, loadTrack } from "../src/tracking/store";
import { LOCK_FAILED, withTrackLock } from "../src/tracking/track-lock";
import { withTrackLockSync } from "../src/tracking/track-lock-sync";
import { dir, fanout, logOf, withEnv } from "./helpers/track-env";

test("journal default: mutation lands via the signed log, no lockfile, no snapshot needed", async () => {
  await withEnv(undefined, async () => {
    const file = join(dir(), "track.json");
    expect(await withTrack(file, (t) => ({ ...t, refsRead: [...t.refsRead, "a.md"] }))).toBe(true);
    expect(existsSync(logOf(file))).toBe(true);
    expect(existsSync(join(dirname(file), "track.lock"))).toBe(false);
    expect((await loadTrack(file)).refsRead).toEqual(["a.md"]);
  });
});

test("kill-switch FUSE_TRACK_JOURNAL=0: legacy locked RMW, envelope written, NO journal log", async () => {
  await withEnv("0", async () => {
    const file = join(dir(), "track.json");
    expect(await withTrack(file, (t) => ({ ...t, refsRead: ["a.md"] }))).toBe(true);
    expect(existsSync(file)).toBe(true);
    expect(existsSync(logOf(file))).toBe(false);
    expect((await loadTrack(file)).refsRead).toEqual(["a.md"]);
  });
});

test("journal concurrency: 8 processes × 3 writes — 24 refs rebuilt, 0 lost, 0 write skipped", async () => {
  await withEnv(undefined, async () => {
    const file = join(dir(), "track.json");
    const { run } = fanout(file, dir()); // fresh virgin HOME: also exercises the .key race
    const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => run(`p${i}`)));
    for (const r of rs) { expect(r.code).toBe(0); expect(r.err).not.toContain("write skipped"); } // 0 skips; 99 = crash sentinel
    const v = await run("v");
    expect(v.code).toBe(0);
    const refs = JSON.parse(v.out) as string[];
    expect(refs.length).toBe(24); // the Phase-1 invariant: zero lost writes
    expect(new Set(refs).size).toBe(24);
  });
});

test("legacy regression (kill-switch): 8×3 under the lock — every write lands or is a NAMED skip", async () => {
  await withEnv("0", async () => {
    const file = join(dir(), "track.json");
    const { run } = fanout(file, dir());
    const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => run(`p${i}`)));
    for (const r of rs) { expect(r.code).not.toBeNull(); expect(r.code).not.toBe(99); }
    const v = await run("v");
    expect(v.code).toBe(0);
    const refs = JSON.parse(v.out) as string[];
    expect(refs.length + rs.reduce<number>((sum, r) => sum + (r.code ?? 0), 0)).toBe(24);
    expect(new Set(refs).size).toBe(refs.length);
  });
});

test("legacy degradation: busy lock -> decision rendered without the write, stderr logged", async () => {
  await withEnv("0", async () => {
    const d = dir();
    writeFileSync(join(d, "track.lock"), "held");
    const writes: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((s: string) => { writes.push(String(s)); return true; }) as typeof process.stderr.write;
    try {
      expect(await withTrack(join(d, "track.json"), (t) => t)).toBe(false);
    } finally { process.stderr.write = orig; }
    expect(writes.some((w) => w.includes("track lock busy"))).toBe(true);
    rmSync(join(d, "track.lock"));
  });
});

test("stale lock: orphaned lockfile past the TTL is reclaimed (primitive unchanged)", async () => {
  const d = dir();
  const lock = join(d, "track.lock");
  writeFileSync(lock, "orphan");
  utimesSync(lock, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
  expect(await withTrackLock(d, async () => "reclaimed")).toBe("reclaimed");
  expect(existsSync(lock)).toBe(false);
});

test("sync lock variant: acquire/run/release, then busy -> LOCK_FAILED without throwing (primitive unchanged)", () => {
  const d = dir();
  expect(withTrackLockSync(d, () => "ok")).toBe("ok");
  expect(existsSync(join(d, "track.lock"))).toBe(false);
  writeFileSync(join(d, "track.lock"), "held");
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    expect(withTrackLockSync(d, () => "never")).toBe(LOCK_FAILED);
  } finally { process.stderr.write = orig; }
  rmSync(join(d, "track.lock"));
});
