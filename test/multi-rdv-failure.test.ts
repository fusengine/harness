/**
 * Failure modes of the rendezvous: every one must degrade to TODAY's standalone
 * behaviour for the affected process — the same deny a lone process prints,
 * never an empty or allow output. Real processes, isolated sandbox, tiny timings.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eventKey } from "../src/cli/rdv/fs";
import { loadScenario, substitute } from "./sim/load";
import { makeSandbox, runSequential, spawnHook, type Sandbox, type Spawned } from "./multi-spawn";

const SCENARIO = join(import.meta.dir, "sim", "scenarios", "01-filesize-block-then-comply.json");
const TUNE = { FUSE_ENFORCE_TTL_SEC: "3600", FUSE_HARNESS_RDV_STEAL_MS: "250", FUSE_HARNESS_RDV_QUIET_MS: "40", FUSE_HARNESS_RDV_STALE_MS: "3000", FUSE_HARNESS_RDV_HARD_MS: "2500", FUSE_HARNESS_RDV_POLL_MS: "2" };
const HOST = "claude-code";

/** The deny-producing event of sim scenario 01 for this sandbox. */
const payloadOf = (sb: Sandbox): string => {
  const step = loadScenario(SCENARIO).steps[0] as { event: unknown };
  return JSON.stringify(substitute(step.event, { TMP: sb.cwd }));
};
const eventDir = (sb: Sandbox): string => join(sb.home, ".fuse-harness", "rdv", eventKey(HOST, sb.cwd, payloadOf(sb)));
const wipe = (sb: Sandbox): void => { for (const n of readdirSync(sb.cwd)) rmSync(join(sb.cwd, n), { recursive: true, force: true }); };

/** A pid that is certainly dead. */
const deadPid = (): Promise<number> => new Promise((res) => { const c = spawn("true"); c.on("close", () => res(c.pid ?? 999_999)); });

let sandboxes: Sandbox[] = [];
afterEach(() => { for (const s of sandboxes) rmSync(s.cwd, { recursive: true, force: true }); sandboxes = []; });

/**
 * Baseline = a lone process with the rendezvous OFF (today). Then wipe, let `prep`
 * poison the rendezvous state, run ONE process with the rendezvous ON: same bytes.
 */
async function sameAsToday(prep: (sb: Sandbox, dir: string) => void | Promise<void>, env: Record<string, string> = {}): Promise<{ base: Spawned; got: Spawned }> {
  const sb = makeSandbox(true);
  sandboxes.push(sb);
  const [base] = await runSequential(HOST, ["core"], payloadOf(sb), sb, { FUSE_ENFORCE_TTL_SEC: "3600" });
  wipe(sb);
  await prep(sb, eventDir(sb));
  const got = await spawnHook({ host: HOST, scope: "core", payload: payloadOf(sb), sb, env: { ...TUNE, ...env } });
  expect(base?.stdout).toContain('"permissionDecision":"deny"');
  expect(got.stdout).toBe((base as Spawned).stdout);
  expect(got.exit).toBe((base as Spawned).exit);
  expect(got.stderr).toBe((base as Spawned).stderr);
  return { base: base as Spawned, got };
}

const touch = (path: string, body = ""): void => { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, body); };

describe("rendezvous failure modes degrade to the standalone path", () => {
  test("nothing special: a lone process leads itself", async () => {
    await sameAsToday(() => undefined);
  });

  test("kill switch: no rendezvous state is ever created", async () => {
    const sb = makeSandbox(true);
    sandboxes.push(sb);
    const got = await spawnHook({ host: HOST, scope: "core", payload: payloadOf(sb), sb, env: { ...TUNE, FUSE_HARNESS_RENDEZVOUS: "0" } });
    expect(got.stdout).toContain('"permissionDecision":"deny"');
    expect(existsSync(join(sb.home, ".fuse-harness", "rdv"))).toBe(false);
  });

  test("leader died moments ago (fresh crash): standalone", async () => {
    const dead = await deadPid();
    await sameAsToday((_sb, dir) => touch(join(dir, "leader"), `${dead}:${Date.now()}`));
  });

  test("leader died long ago (stale generation): restart clean, lead", async () => {
    const dead = await deadPid();
    await sameAsToday((_sb, dir) => {
      touch(join(dir, "leader"), `${dead}:1`);
      const old = new Date(Date.now() - 60_000);
      utimesSync(join(dir, "leader"), old, old);
    });
  });

  test("set already closed (late arrival): standalone", async () => {
    await sameAsToday((_sb, dir) => { touch(join(dir, "leader"), `${process.pid}:${Date.now()}`); touch(join(dir, "closed")); });
  });

  test("a live leader that never answers: the follower steals its scope", async () => {
    const sleeper = spawn("sleep", ["30"]);
    try {
      const { got } = await sameAsToday((_sb, dir) => touch(join(dir, "leader"), `${sleeper.pid}:${Date.now()}`));
      expect(got.wallMs).toBeGreaterThan(200); // waited for the steal window
    } finally { sleeper.kill("SIGKILL"); }
  });

  test("the leader dies while we wait (no steal window yet): standalone", async () => {
    const mortal = spawn("sleep", ["0.5"]);
    await sameAsToday((_sb, dir) => touch(join(dir, "leader"), `${mortal.pid}:${Date.now()}`), { FUSE_HARNESS_RDV_STEAL_MS: "60000" });
  });

  test("corrupt state: the event dir path is a FILE", async () => {
    await sameAsToday((_sb, dir) => touch(dir, "not a directory"));
  });

  test("unwritable rendezvous root (EACCES)", async () => {
    await sameAsToday((sb) => {
      const root = join(sb.home, ".fuse-harness", "rdv");
      mkdirSync(root, { recursive: true });
      chmodSync(root, 0o500);
    });
    // restore so the afterEach cleanup can delete it
    for (const s of sandboxes) { try { chmodSync(join(s.home, ".fuse-harness", "rdv"), 0o700); } catch { /* none */ } }
  });

  test("rendezvous root is a file (disk-level fault)", async () => {
    await sameAsToday((sb) => touch(join(sb.home, ".fuse-harness", "rdv"), "x"));
  });

  test("a live leader that never answers and no steal: the hard bound ends the wait", async () => {
    const sleeper = spawn("sleep", ["30"]);
    try {
      await sameAsToday((_sb, dir) => touch(join(dir, "leader"), `${sleeper.pid}:${Date.now()}`), { FUSE_HARNESS_RDV_STEAL_MS: "60000", FUSE_HARNESS_RDV_HARD_MS: "600" });
    } finally { sleeper.kill("SIGKILL"); }
  });
});
