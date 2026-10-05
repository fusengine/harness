/**
 * On-disk layout of one rendezvous event directory. Light (node:* only).
 *
 *   <home>/.fuse-harness/rdv/<key>/
 *     leader          `<pid>:<ms>` — O_EXCL winner = the leader
 *     closed          O_EXCL — the leader will accept no further registrations
 *     reg-<name>      Registration JSON (atomic) — one per participating process
 *     claim-<name>    O_EXCL — whoever creates it runs that registration's scope
 *     res-<name>      ResultFile JSON (atomic) — the leader's answer for <name>
 */
import { homedir } from "node:os";
import { join } from "node:path";

/** Rendezvous root for the current user (`HOME` is part of the isolation key). */
export function rdvRoot(home: string = homedir()): string {
  return join(home, ".fuse-harness", "rdv");
}

/** Sortable, unique registration name: zero-padded epoch ms + pid. */
export function regName(pid: number = process.pid, now: number = Date.now()): string {
  return `${String(now).padStart(15, "0")}-${pid}`;
}

/** Paths of the files in an event dir. */
export const layout = {
  leader: (dir: string): string => join(dir, "leader"),
  closed: (dir: string): string => join(dir, "closed"),
  /** One line per registration the leader ran, in the order it ran them (diagnostics + tests). */
  order: (dir: string): string => join(dir, "order"),
  reg: (dir: string, name: string): string => join(dir, `reg-${name}`),
  claim: (dir: string, name: string): string => join(dir, `claim-${name}`),
  res: (dir: string, name: string): string => join(dir, `res-${name}`),
};

/** `reg-<name>` file names in `names` (a readdir listing), sorted by arrival. */
export function sortedRegNames(names: string[]): string[] {
  return names.filter((n) => n.startsWith("reg-") && !n.endsWith(".tmp")).map((n) => n.slice(4)).sort();
}
