/**
 * Sim replay under fan-out: every test/sim scenario step is spawned with the
 * scopes its host would really spawn (concurrent, rendezvous ON) and compared
 * to the same scopes run separately (OFF) in the leader's order: stdout,
 * stderr, exit and final on-disk state must be identical.
 *
 * Default: a representative subset. `RDV_FULL=1 bun test test/multi-rdv-sim.test.ts` replays all.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { noteAttempt, runCase } from "./multi-differential";
import { scenarioToCase } from "./multi-sim";

const DIR = join(import.meta.dir, "sim", "scenarios");
const ALL = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
const SUBSET = ["01-", "03-", "13-", "16-", "19-", "22-", "17-", "07-"];
const PICK = process.env.RDV_FULL === "1" ? ALL : ALL.filter((f) => SUBSET.some((p) => f.startsWith(p)));

describe("sim scenarios under rendezvous fan-out", () => {
  for (const file of PICK) {
    test(file, async () => {
      noteAttempt(`sim:${file}`);
      const { steps, stateDiffs } = await runCase(scenarioToCase(join(DIR, file)));
      for (const s of steps) {
        expect(s.outputDiffs).toEqual([]);
        // the rendezvous really ran: the leader executed several of the scopes (slow ones are handed back, see stats.ts)
        expect(s.order.length).toBeGreaterThanOrEqual(Math.min(2, s.scopes.length));
      }
      expect(stateDiffs).toEqual([]);
    }, { timeout: 300_000, retry: 2 }); // the ON/OFF passes have different wall-clock profiles against 2-3 s product windows (burst dedup, inject dedup): a timing flip passes on retry, a logic divergence fails every run
  }
});
