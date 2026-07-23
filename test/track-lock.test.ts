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

test("concurrency: 8 processes × 3 writes each — no write lost SILENTLY under the lock", async () => {
  const d = dir();
  const file = join(d, "track.json");
  const storePath = join(new URL("..", import.meta.url).pathname, "src/tracking/store.ts");
  // Each worker reports how many of its 3 writes were fail-open-skipped (withTrack -> false,
  // see track-lock.ts's documented contention budget) via its OWN exit code, not stdout:
  // buffering/flush timing across 8 concurrent child processes is not reliable on a loaded
  // CI runner (observed: skip counts silently read back as 0), while the exit code is
  // delivered by the kernel's waitpid and carries no such race. 99 is a crash sentinel,
  // clearly outside the valid 0-3 skip range, so a real failure can't be folded into a skip.
  const script = `import { withTrack } from ${JSON.stringify(storePath)};
const file = ${JSON.stringify(file)}, id = process.env.WORKER_ID;
let skipped = 0;
try {
  for (let i = 0; i < 3; i++) { const ok = await withTrack(file, (t) => ({ ...t, refsRead: [...(t.refsRead ?? []), id + "-" + i] })); if (!ok) skipped++; }
} catch { process.exit(99); }
process.exit(skipped);`;
  const procs = Array.from({ length: 8 }, (_, i) => new Promise<{ code: number | null }>((done) => {
    const p = spawn("bun", ["-e", script], { env: { ...process.env, WORKER_ID: `p${i}` } });
    p.on("close", (code) => done({ code }));
  }));
  const results = await Promise.all(procs);
  // No worker crashed (99) or was killed by a signal (null) — a real failure must fail the
  // test loudly, never be silently folded into the skip tally.
  for (const r of results) { expect(r.code).not.toBeNull(); expect(r.code).not.toBe(99); }
  const totalSkipped = results.reduce((sum, r) => sum + (r.code as number), 0);
  const track = await loadTrack(file);
  const landed = track.refsRead?.length ?? 0;
  // Every attempted write either lands or is a named fail-open skip — never silently vanishes.
  // A starved runner (few vCPUs, 8-way contention) can legitimately skip some; that is by design.
  expect(landed + totalSkipped).toBe(24);
  // No duplicate/corrupted entries: the lock must never let two writers land the same slot.
  expect(new Set(track.refsRead ?? []).size).toBe(landed);
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
