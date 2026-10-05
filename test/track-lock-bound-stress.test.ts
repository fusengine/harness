/**
 * Stress: 30 concurrent processes append (tiny lock budget -> heavy spilling)
 * while compactions run in a loop. Zero lost, zero duplicated events.
 */
import { test, expect } from "bun:test";
import { readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { loadTrack } from "../src/tracking/store";
import { appendEvent } from "../src/tracking/track-journal";
import { journalLogPath, maybeCompactJournal } from "../src/tracking/track-compact";
import { dir, TJOURNAL, withEnv } from "./helpers/track-env";

const PROCS = 30, EACH = 40, BASE = 1_700_000_000_000;

test("30 processes × 40 appends during repeated compactions: 0 lost, 0 duplicated", async () => {
  await withEnv(undefined, async () => {
    const prev = [process.env.FUSE_TRACK_COMPACT_BYTES, process.env.FUSE_TRACK_LOCK_BUDGET_MS];
    process.env.FUSE_TRACK_COMPACT_BYTES = "1"; // every trigger really compacts
    process.env.FUSE_TRACK_LOCK_BUDGET_MS = "50"; // clamp floor: contention spills
    try {
      const d = dir(), file = join(d, "track.json"), log = journalLogPath(file);
      appendEvent(log, "agents", "append", { id: "seed" }, BASE); // pins the .key before the fan-out
      const script = (p: number): string => `import { appendEvent } from ${JSON.stringify(TJOURNAL)};
for (let i = 0; i < ${EACH}; i++) appendEvent(${JSON.stringify(log)}, "agents", "append", { id: "p${p}-" + i }, ${BASE} + ${p} * 1000 + i);`;
      // Contention must not depend on machine speed (a fast CI runner never contended): hold track.lock
      // ourselves (fresh mtime, far below the 10 s stale TTL) until the first spill is seen, then release.
      const lock = join(d, "track.lock"), t0 = Date.now();
      writeFileSync(lock, "held-by-test");
      let alive = PROCS, spilled = 0, held = true;
      const exits = Array.from({ length: PROCS }, (_, p) => new Promise<number | null>((done) => {
        const c = spawn("bun", ["-e", script(p)], { env: { ...process.env }, stdio: ["ignore", "ignore", "pipe"] });
        c.stderr.on("data", (b: Buffer) => { spilled += b.toString().split("event spilled").length - 1; });
        c.on("close", (code) => { alive--; done(code); });
      }));
      while (alive > 0) {
        if (held && (spilled > 0 || Date.now() - t0 > 8000)) { unlinkSync(lock); held = false; } // < 10 s stale TTL
        if (!held) await maybeCompactJournal(file);
        await new Promise((r) => setTimeout(r, 5));
      }
      if (held) unlinkSync(lock);
      for (const code of await Promise.all(exits)) expect(code).toBe(0);
      expect(spilled).toBeGreaterThan(0); // the spill path WAS exercised (otherwise this proves nothing)
      console.log(`stress: ${spilled} events spilled, all folded`);
      await maybeCompactJournal(file); // final absorb of whatever is left
      const ids = (await loadTrack(file)).agents.map((a) => (a as unknown as { id: string }).id);
      expect(ids.length).toBe(PROCS * EACH + 1); // 0 lost AND 0 duplicated (agents are never deduped)
      expect(new Set(ids).size).toBe(PROCS * EACH + 1);
      expect(readdirSync(d).filter((n) => n.includes(".spill.") || n.endsWith(".folding"))).toEqual([]);
    } finally {
      for (const [i, k] of ["FUSE_TRACK_COMPACT_BYTES", "FUSE_TRACK_LOCK_BUDGET_MS"].entries()) {
        if (prev[i] === undefined) delete process.env[k]; else process.env[k] = prev[i];
      }
    }
  });
}, 120_000);
