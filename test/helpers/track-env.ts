/** Shared track-test helpers: env pinning, tmp dirs, seeded PRNG, the 8×3 write fan-out. */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export const dir = (): string => mkdtempSync(join(tmpdir(), "fh-lock-"));
export const STORE: string = join(new URL("../..", import.meta.url).pathname, "src/tracking/store.ts");
export const TJOURNAL: string = join(new URL("../..", import.meta.url).pathname, "src/tracking/track-journal.ts");
export const TCOMPACT: string = join(new URL("../..", import.meta.url).pathname, "src/tracking/track-compact.ts");
export const logOf = (file: string): string => file.replace(/\.json$/, ".log");

/** Run `body` with FUSE_TRACK_JOURNAL pinned (undefined = journal default), restoring it after. */
export async function withEnv<T>(value: string | undefined, body: () => Promise<T>): Promise<T> {
  const prev = process.env.FUSE_TRACK_JOURNAL;
  if (value === undefined) delete process.env.FUSE_TRACK_JOURNAL;
  else process.env.FUSE_TRACK_JOURNAL = value;
  try {
    return await body();
  } finally {
    if (prev === undefined) delete process.env.FUSE_TRACK_JOURNAL;
    else process.env.FUSE_TRACK_JOURNAL = prev;
  }
}

/** Deterministic PRNG (mulberry32) — reproducible sequences, never Math.random. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type FanoutRun = { code: number | null; out: string; err: string };

/**
 * Worker source for an 8-process × 3-write fan-out against `file`: each worker
 * appends 3 distinct refs via withTrack and exits with its SKIP count (0 in
 * journal mode); id "v" prints the rebuilt refsRead. `home` must be a fresh
 * dir (hermetic .key — a virgin home also exercises the key-creation race).
 */
export function fanout(file: string, home: string): { run: (id: string) => Promise<FanoutRun> } {
  const script = `import { withTrack, loadTrack } from ${JSON.stringify(STORE)};
const file = ${JSON.stringify(file)}, id = process.env.WORKER_ID;
if (id === "v") { process.stdout.write(JSON.stringify((await loadTrack(file)).refsRead ?? [])); process.exit(0); }
let skipped = 0;
try { for (let i = 0; i < 3; i++) { const ok = await withTrack(file, (t) => ({ ...t, refsRead: [...(t.refsRead ?? []), id + "-" + i] })); if (!ok) skipped++; } } catch { process.exit(99); }
process.exit(skipped);`;
  const run = (id: string) =>
    new Promise<FanoutRun>((done) => {
      const p = spawn("bun", ["-e", script], { env: { ...process.env, HOME: home, WORKER_ID: id } });
      let out = "", err = "";
      p.stdout!.on("data", (c: Buffer) => (out += c.toString()));
      p.stderr!.on("data", (c: Buffer) => (err += c.toString()));
      p.on("close", (code) => done({ code, out, err }));
    });
  return { run };
}
