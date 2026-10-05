/**
 * @module test/multi-spawn
 * Spawn helpers for the rendezvous tests: real `bin.ts hook <host> [scope]`
 * processes with an isolated HOME/cwd, sequentially (baseline = today's
 * behaviour, rendezvous OFF) or concurrently with a stagger (rendezvous ON).
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Repo bin (`bun src/cli/bin.ts`), or the built one when `SIM_BIN` is set. */
export const BIN: string = process.env.SIM_BIN ?? join(import.meta.dir, "..", "src", "cli", "bin.ts");
const FIXTURE_REFS: string = join(import.meta.dir, "sim", "fixtures", "refs");

/** One finished process. */
export interface Spawned {
  scope: string | undefined;
  stdout: string;
  stderr: string;
  exit: number;
  pid: number;
  /** Peak RSS in bytes when measured (`/usr/bin/time -l`), else 0. */
  rssBytes: number;
  /** user+sys CPU ms when measured, else 0. */
  cpuMs: number;
  wallMs: number;
}

/** An isolated sandbox: HOME + project cwd. */
export interface Sandbox {
  home: string;
  cwd: string;
}

/**
 * Fresh sandbox (realpath'd: macOS /tmp is a symlink and paths end up in payloads).
 * @param shared - HOME and project cwd are the SAME dir, like test/sim (`$TMP`).
 */
export function makeSandbox(shared = false): Sandbox {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "fh-rdv-")));
  const home = shared ? root : join(root, "home");
  const cwd = shared ? root : join(root, "proj");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  return { home, cwd };
}

/** Minimal deterministic env (same idea as test/sim/exec.ts). */
export function spawnEnvFor(sb: Sandbox, extra: Record<string, string> = {}): Record<string, string> {
  // Rendezvous is opt-in (default OFF); these suites exercise it, so they opt in unless a call overrides.
  return { PATH: process.env.PATH ?? "", HOME: sb.home, FUSE_HARNESS_REFS: FIXTURE_REFS, FUSE_HARNESS_RENDEZVOUS: "1", ...extra };
}

/** Options of {@link spawnHook}. */
export interface SpawnOpts {
  host: string;
  scope?: string;
  payload: string;
  sb: Sandbox;
  env?: Record<string, string>;
  measure?: boolean;
}

/**
 * Start one hook process WITHOUT feeding stdin yet (it boots, then blocks on stdin — the reader waits up to
 * FUSE_HOOK_STDIN_PARTIAL_MS for a first byte); `feed` writes the payload and closes stdin.
 * @param o - Spawn options (no payload: pass it to `feed`).
 * @returns `feed` to send the payload, `done` resolving with everything the process produced.
 */
export function startHook(o: Omit<SpawnOpts, "payload">): { feed: (payload: string) => void; done: Promise<Spawned> } {
  const args = [BIN, "hook", o.host, ...(o.scope ? [o.scope] : [])];
  const runtime = process.env.RDV_RUNTIME ?? (process.env.SIM_BIN ? "node" : "bun"); // RDV_RUNTIME=bun runs the built bin like the hosts do
  const cmd = o.measure ? "/usr/bin/time" : runtime;
  const argv = o.measure ? ["-l", runtime, ...args] : args;
  const t0 = Date.now();
  const child = spawn(cmd, argv, { cwd: o.sb.cwd, env: spawnEnvFor(o.sb, o.env), stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.on("error", () => undefined);
  const done = new Promise<Spawned>((resolve) => {
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString("utf8"); });
    child.on("close", (code) => {
      const m = o.measure ? /(\d+)\s+maximum resident set size/.exec(stderr) : null;
      const cpu = o.measure ? /([\d.]+)\s+real\s+([\d.]+)\s+user\s+([\d.]+)\s+sys/.exec(stderr) : null;
      if (o.measure) stderr = stderr.split("\n").filter((l) => !/^\s+[\d.]+\s+(real|user|sys)|^\s+\d+\s+[a-z ]+$|^\s*[\d.]+ real/.test(l)).join("\n");
      const cpuMs = cpu ? Math.round((Number(cpu[2]) + Number(cpu[3])) * 1000) : 0;
      resolve({ scope: o.scope, stdout, stderr, exit: code ?? 1, pid: child.pid ?? 0, rssBytes: m ? Number(m[1]) : 0, cpuMs, wallMs: Date.now() - t0 });
    });
  });
  return { feed: (payload) => void child.stdin.end(payload), done };
}

/** Spawn one hook process, feed `payload` on stdin, resolve with everything it produced. */
export function spawnHook(o: SpawnOpts): Promise<Spawned> {
  const h = startHook(o);
  h.feed(o.payload);
  return h.done;
}

/**
 * Run `scopes` one after the other (the order given), rendezvous OFF: today's behaviour. All processes
 * are STARTED first (they boot together, as a host's real fan-out does) and fed one at a time, so the
 * step stays inside the product's 2 s burst window like a real sibling burst — booting each one in turn
 * (~150 ms of bun startup apiece) made a 14-scope step exceed it and turned later siblings into "repeats".
 */
export async function runSequential(host: string, scopes: (string | undefined)[], payload: string, sb: Sandbox, env: Record<string, string> = {}): Promise<Spawned[]> {
  const started = scopes.map((scope) => startHook({ host, scope, sb, env: { ...env, FUSE_HARNESS_RENDEZVOUS: "0" } }));
  const out: Spawned[] = [];
  for (const h of started) { h.feed(payload); out.push(await h.done); }
  return out;
}

/** Run `scopes` concurrently, started `staggerMs` apart, rendezvous ON. */
export async function runConcurrent(host: string, scopes: (string | undefined)[], payload: string, sb: Sandbox, staggerMs = 8, env: Record<string, string> = {}, jitterMs = 0): Promise<Spawned[]> {
  const pending: Promise<Spawned>[] = [];
  for (const scope of scopes) {
    pending.push(spawnHook({ host, scope, payload, sb, env }));
    const gap = staggerMs + Math.random() * jitterMs;
    if (gap > 0) await new Promise((r) => setTimeout(r, gap));
  }
  return Promise.all(pending);
}
