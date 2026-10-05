/**
 * Shared types of the per-event rendezvous (hook process de-duplication).
 *
 * Protocol in one paragraph: the N hook processes a host spawns for ONE event
 * (same host id + cwd + identical stdin bytes) meet in `<home>/.fuse-harness/rdv/<key>/`.
 * One process wins `leader` (O_EXCL), every process registers (`reg-*`), and the
 * leader runs each registration's scope in-process, one after the other, writing
 * `res-<reg>`. Every process prints ITS OWN scope's stdout/stderr/exit — only the
 * work (module load, state reads) is shared. A registration the leader has not
 * CLAIMED (`claim-<reg>`, O_EXCL) can always be run by its own process instead.
 */

/** Timing/limit knobs, all in milliseconds unless noted (see `config.ts`). */
export interface RdvTuning {
  /** Floor of the leader's idle window with no new registration before it closes the set. */
  quietMs: number;
  /** Follower waits this long for a leader claim before running its own scope. */
  stealMs: number;
  /** Leader stops claiming new registrations past this age. */
  budgetMs: number;
  /** A closed event dir older than this is stale (a later identical event restarts). */
  staleMs: number;
  /** Absolute follower bound before it stops waiting on a live leader. */
  hardMs: number;
  /** Poll interval for the sync wait loops. */
  pollMs: number;
  /** Payloads larger than this never rendezvous (bytes of stdin text). */
  maxTextBytes: number;
  /** A scope whose observed average is >= this runs in its own process (leader declines it). */
  slowMs: number;
}

/** What one `hook <id> <scope>` invocation prints and exits with. */
export interface UnitResult {
  stdout: string;
  stderr: string;
  exit: number;
}

/** A result file: either the unit's output, or "run it yourself" (leader declined). */
export type ResultFile = ({ kind: "result" } & UnitResult) | { kind: "decline" };

/** One process's entry in the rendezvous set (`reg-<name>` file content). */
export interface Registration {
  id: string;
  /** `argv[4]`; absent for the bare `hook <id>` form (= core). */
  scopeArg?: string;
  pid: number;
  /** Spawn-time environment of the registering process (pre-dotenv). */
  env: Record<string, string>;
}

/** Inputs shared by every attempt to join the rendezvous. */
export interface RdvContext {
  id: string;
  scopeArg?: string;
  /** Raw stdin text (identical across the siblings of one event). */
  text: string;
  cwd: string;
  /** Spawn-time environment snapshot (pre-dotenv). */
  env: Record<string, string>;
  tuning: RdvTuning;
  /** Rendezvous root (`<home>/.fuse-harness/rdv`). */
  root: string;
}

/** How a process learned what to print. */
export type RdvOutcome =
  | { kind: "result"; result: UnitResult; role: "leader" | "follower" }
  | { kind: "standalone"; why: string };
