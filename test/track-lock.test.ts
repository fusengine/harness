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
  const d = dir(), home = dir(), file = join(d, "track.json");
  const storePath = join(new URL("..", import.meta.url).pathname, "src/tracking/store.ts");
  // Hermetic HOME (CI flake fix): the parent froze HARNESS_DIR at import while
  // neighbouring tests mutate process.env.HOME — workers signed under a home
  // whose .key differed from the verifier's → verifyTrack rejected every write
  // (landed=0, skipped=0). A 9th verifier worker shares the SAME pinned HOME.
  const script = `import { withTrack, loadTrack } from ${JSON.stringify(storePath)};
const file = ${JSON.stringify(file)}, id = process.env.WORKER_ID;
if (id === "v") { process.stdout.write(JSON.stringify((await loadTrack(file)).refsRead ?? [])); process.exit(0); }
let skipped = 0;
try {
  for (let i = 0; i < 3; i++) { const ok = await withTrack(file, (t) => ({ ...t, refsRead: [...(t.refsRead ?? []), id + "-" + i] })); if (!ok) skipped++; }
} catch { process.exit(99); }
process.exit(skipped);`;
  const run = (id: string) => new Promise<{ code: number | null; out: string }>((done) => {
    const p = spawn("bun", ["-e", script], { env: { ...process.env, HOME: home, WORKER_ID: id } });
    let out = "";
    p.stdout!.on("data", (c: Buffer) => (out += c.toString()));
    p.on("close", (code) => done({ code, out }));
  });
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => run(`p${i}`)));
  // Exit code = skip count (kernel waitpid, race-free); 99 = crash sentinel.
  for (const r of results) { expect(r.code).not.toBeNull(); expect(r.code).not.toBe(99); }
  const totalSkipped = results.reduce<number>((sum, r) => sum + (r.code ?? 0), 0);
  const v = await run("v");
  expect(v.code).toBe(0);
  const refs = JSON.parse(v.out) as string[];
  const landed = refs.length;
  // Every attempted write either lands or is a named fail-open skip — never silently vanishes.
  expect(landed + totalSkipped).toBe(24);
  // No duplicate/corrupted entries: the lock must never let two writers land the same slot.
  expect(new Set(refs).size).toBe(landed);
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
test("virgin-home .key race: 8 workers x 3 writes converge on ONE key (CI fix)", async () => {
  const home = dir(), file = join(dir(), "track.json");
  const script = `import { withTrack, loadTrack } from ${JSON.stringify(join(new URL("..", import.meta.url).pathname, "src/tracking/store.ts"))};
const f = ${JSON.stringify(file)}, id = process.env.WORKER_ID;
if (id === "v") process.exit((await loadTrack(f)).refsRead?.length ?? 0); else { let s = 0; try { for (let i = 0; i < 3; i++) if (!(await withTrack(f, (t) => ({ ...t, refsRead: [...(t.refsRead ?? []), id + "-" + i] })))) s++; } catch { process.exit(99); } process.exit(s); }`;
  const run = (id: string) => new Promise<number | null>((done) => spawn("bun", ["-e", script], { env: { ...process.env, HOME: home, WORKER_ID: id } }).on("close", done));
  const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => run(`p${i}`)));
  expect(rs.some((c) => c === null || c === 99)).toBe(false);
  expect((await run("v"))! + rs.reduce<number>((sum, c) => sum + (c ?? 0), 0)).toBe(24);
});
