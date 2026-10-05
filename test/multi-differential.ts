/**
 * @module test/multi-differential
 * The differential oracle: for each event, B = the scopes spawned CONCURRENTLY
 * with the rendezvous ON, A = the same scopes run one after another with it OFF
 * (today's behaviour) in the order the leader processed them. Per process the
 * stdout/stderr/exit must be byte-identical, and the sandbox state left behind
 * must match. Every sandbox path/clock/signature is normalised first.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eventKey } from "../src/cli/rdv/fs";
import { diffSnapshots, normalize, snapshot } from "./multi-state";
import { makeSandbox, runConcurrent, runSequential, type Sandbox, type Spawned } from "./multi-spawn";

/** One event of a case: the payload (it embeds sandbox paths) and the processes the host spawns. */
export interface Step {
  payloadFor: (sb: Sandbox) => Record<string, unknown>;
  scopes: (string | undefined)[];
  staggerMs?: number;
  /** Extra random 0..jitterMs gap between spawns (random arrival order/timing). */
  jitterMs?: number;
  /** Real wall-clock gap before the step (time-window guards), applied to A and B alike. */
  delayMs?: number;
}

/** A case = optional setup + one or more events replayed in order. */
export interface Case {
  host: string;
  setup?: (sb: Sandbox) => void;
  steps: Step[];
  /** Env overlay, `sb`-aware (scenario env uses `$TMP`). */
  env?: (sb: Sandbox) => Record<string, string>;
  /** HOME == cwd, like test/sim. */
  shared?: boolean;
}

/** Outcome of one step. */
export interface StepResult {
  scopes: (string | undefined)[];
  /** Indexes (into scopes) in the order the leader processed them. */
  order: number[];
  outputDiffs: string[];
  /** Processes the leader served (everything else ran standalone). */
  served: number;
  a: Spawned[];
  b: Spawned[];
}

/** Write a file (and its parents) inside a sandbox. */
export function put(sb: Sandbox, rel: string, body: string): void {
  const path = join(sb.cwd, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
}

/** The reg files of this event's rendezvous dir -> pids, in the leader's processing order. */
function leaderOrder(sb: Sandbox, host: string, payload: string): { pids: number[]; claimed: number } {
  const dir = join(sb.home, ".fuse-harness", "rdv", eventKey(host, sb.cwd, payload));
  if (!existsSync(dir)) return { pids: [], claimed: 0 };
  const ran = existsSync(join(dir, "order")) ? readFileSync(join(dir, "order"), "utf8").split("\n").filter(Boolean) : [];
  const pids = ran.map((n) => (JSON.parse(readFileSync(join(dir, `reg-${n}`), "utf8")) as { pid: number }).pid);
  return { pids, claimed: readdirSync(dir).filter((n) => n.startsWith("claim-")).length };
}

/** Compare two process outputs after normalisation; returns the differences. */
function compareOutputs(label: string, a: Spawned, b: Spawned, sb: Sandbox): string[] {
  const out: string[] = [];
  for (const f of ["stdout", "stderr"] as const) {
    if (normalize(a[f], sb) !== normalize(b[f], sb)) out.push(`${label} ${f} differs\n  A: ${normalize(a[f], sb).slice(0, 300)}\n  B: ${normalize(b[f], sb).slice(0, 300)}`);
  }
  if (a.exit !== b.exit) out.push(`${label} exit ${a.exit} != ${b.exit}`);
  return out;
}

/** Empty both sandbox dirs (the same paths are reused for the A pass, so no path ever differs). */
function wipe(sb: Sandbox): void {
  for (const dir of new Set([sb.home, sb.cwd])) {
    for (const name of readdirSync(dir)) rmSync(join(dir, name), { recursive: true, force: true });
  }
}

/** The B pass of one step: concurrent spawns, then who the leader served and in which order. */
async function passB(c: Case, step: Step, sb: Sandbox): Promise<{ b: Spawned[]; order: number[]; served: number; payload: string }> {
  if (step.delayMs) await new Promise((r) => setTimeout(r, step.delayMs));
  const payload = JSON.stringify(step.payloadFor(sb));
  // No steal/budget decline in the oracle: those paths run scopes CONCURRENTLY (today's race), tested apart in multi-rdv-failure.
  const env = { FUSE_HARNESS_RDV_STEAL_MS: "20000", FUSE_HARNESS_RDV_BUDGET_MS: "30000", FUSE_HARNESS_RDV_HARD_MS: "60000", ...c.env?.(sb) };
  const b = await runConcurrent(c.host, step.scopes, payload, sb, step.staggerMs ?? 8, env, step.jitterMs ?? 0);
  const { pids, claimed } = leaderOrder(sb, c.host, payload);
  const order = pids.map((p) => b.findIndex((x) => x.pid === p)).filter((i) => i >= 0);
  // A later step with the SAME bytes (the sim repeats events) must form a fresh set, not look "late".
  const rdv = join(sb.home, ".fuse-harness", "rdv");
  for (const n of existsSync(rdv) ? readdirSync(rdv) : []) if (n !== "stats.json") rmSync(join(rdv, n), { recursive: true, force: true });
  return { b, order, served: claimed, payload };
}

/**
 * Run a case in ONE sandbox, twice: pass B (rendezvous ON, concurrent) then —
 * after wiping it back to the initial state — pass A (rendezvous OFF, one
 * process after the other in the order the leader processed them). Same paths
 * in both passes, so only clock/nonce noise is normalised.
 */
export async function runCase(c: Case): Promise<{ steps: StepResult[]; stateDiffs: string[] }> {
  const sb = makeSandbox(c.shared);
  c.setup?.(sb);
  const passes: Awaited<ReturnType<typeof passB>>[] = [];
  for (const step of c.steps) passes.push(await passB(c, step, sb));
  const snapB = snapshot(sb);
  wipe(sb);
  c.setup?.(sb);
  const results: StepResult[] = [];
  for (const [n, step] of c.steps.entries()) {
    const { b, order, served, payload } = passes[n] as (typeof passes)[number];
    const sequence = [...order, ...step.scopes.map((_, i) => i).filter((i) => !order.includes(i))];
    if (step.delayMs) await new Promise((r) => setTimeout(r, step.delayMs));
    const ran = await runSequential(c.host, sequence.map((i) => step.scopes[i]), payload, sb, c.env?.(sb));
    const a: Spawned[] = [];
    sequence.forEach((i, k) => { a[i] = ran[k] as Spawned; });
    const diffs = sequence.flatMap((i) => compareOutputs(`[${i}:${step.scopes[i] ?? "core"}]`, a[i] as Spawned, b[i] as Spawned, sb));
    results.push({ scopes: step.scopes, order, outputDiffs: diffs, served, a, b });
  }
  return { steps: results, stateDiffs: diffSnapshots(snapshot(sb), snapB) };
}
