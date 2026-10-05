/**
 * Janitor of the rendezvous root. Bounded and best effort: it can never fail a hook.
 */
import { readdirSync, rmSync } from "node:fs";
import { ageMs } from "./fs";
import { layout } from "./layout";

/** Closed generations older than this are removable (an OPEN one is an event in flight). */
const REMOVABLE_AFTER_MS = 600_000;

/**
 * Remove leftovers of old generations: `*.gc-*` aside-dirs and event dirs closed
 * more than 10 minutes ago. At most 64 entries are inspected per call, from a
 * rotating start so a crowd of fresh dirs cannot hide the old ones forever.
 * @param root - The rendezvous root.
 */
export function sweep(root: string): void {
  try {
    const all = readdirSync(root);
    const start = all.length > 64 ? Date.now() % all.length : 0;
    for (const name of [...all.slice(start), ...all.slice(0, start)].slice(0, 64)) {
      if (name === "stats.json" || name.endsWith(".tmp")) continue;
      const path = `${root}/${name}`;
      const closedAge = ageMs(layout.closed(path));
      if (name.includes(".gc-") || (Number.isFinite(closedAge) && closedAge > REMOVABLE_AFTER_MS)) rmSync(path, { recursive: true, force: true });
    }
  } catch { /* never fatal */ }
}
