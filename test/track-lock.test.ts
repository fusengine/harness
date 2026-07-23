import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, utimesSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { withTrack, loadTrack } from "../src/tracking/store";
import { LOCK_FAILED, withTrackLock } from "../src/tracking/track-lock";
import { withTrackLockSync } from "../src/tracking/track-lock-sync";

const dir = (): string => mkdtempSync(join(tmpdir(), "fh-lock-"));

test("locked RMW: mutation lands and track stays valid", async () => {
  const file = join(dir(), "track.json");
  const ok = await withTrack(file, (track) => ({ ...track, refsRead: [...(track.refsRead ?? []), "a.md"] }));
  expect(ok).toBe(true);
  const track = await loadTrack(file);
  expect(track.refsRead?.length).toBe(1);
});

test("concurrency: 8 processes × 3 writes each — zero lost write under the lock", async () => {
  const d = dir();
  const file = join(d, "track.json");
  const storePath = join(new URL("..", import.meta.url).pathname, "src/tracking/store.ts");
  const script = `import { withTrack } from ${JSON.stringify(storePath)};
const file = ${JSON.stringify(file)}, id = process.env.WORKER_ID;
for (let i = 0; i < 3; i++) await withTrack(file, (t) => ({ ...t, refsRead: [...(t.refsRead ?? []), id + "-" + i] }));`;
  const procs = Array.from({ length: 8 }, (_, i) => new Promise<number | null>((done) => {
    spawn("bun", ["-e", script], { env: { ...process.env, WORKER_ID: `p${i}` } }).on("close", done);
  }));
  for (const code of await Promise.all(procs)) expect(code).toBe(0);
  const track = await loadTrack(file);
  expect(track.refsRead?.length).toBe(24);
  expect(new Set(track.refsRead ?? []).size).toBe(24);
});

test("degradation: busy lock -> decision rendered without the write, stderr logged", async () => {
  const d = dir();
  writeFileSync(join(d, "track.lock"), "held");
  const writes: string[] = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((s: string) => { writes.push(String(s)); return true; }) as typeof process.stderr.write;
  try {
    const ok = await withTrack(join(d, "track.json"), (t) => t);
    expect(ok).toBe(false);
  } finally { process.stderr.write = orig; }
  expect(writes.some((w) => w.includes("track lock busy"))).toBe(true);
  rmSync(join(d, "track.lock"));
});

test("stale lock: orphaned lockfile past the TTL is reclaimed", async () => {
  const d = dir();
  const lock = join(d, "track.lock");
  writeFileSync(lock, "orphan");
  utimesSync(lock, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
  const ran = await withTrackLock(d, async () => "reclaimed");
  expect(ran).toBe("reclaimed");
  expect(existsSync(lock)).toBe(false);
});

test("sync variant: acquire/run/release, then busy -> LOCK_FAILED without throwing", () => {
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
