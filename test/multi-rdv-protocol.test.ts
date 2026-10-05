/**
 * Protocol-level behaviour with real concurrent processes: random arrival
 * orders, a leader killed mid-event, per-process env, and generations
 * (repeated identical event). The deterministic probe is `rules` on
 * SessionStart: stateless, non-empty, and driven by CLAUDE_PLUGIN_ROOT.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { eventKey } from "../src/cli/rdv/fs";
import { codexScopesFor } from "./multi-routes";
import { noteAttempt, put, runCase, type Step } from "./multi-differential";
import { makeSandbox, spawnHook, type Sandbox } from "./multi-spawn";

const project = (sb: Sandbox): void => { put(sb, "package.json", '{"name":"p"}'); put(sb, "src/a.ts", "export const a = 1;\n"); };
const codexEvent = (event: string, extra: Record<string, unknown>) => (sb: Sandbox): Record<string, unknown> => ({
  hook_event_name: event, session_id: "sess-p", turn_id: `turn-${Math.random()}`, cwd: sb.cwd, model: "m", permission_mode: "default", transcript_path: null, ...extra,
});
const shuffled = <T,>(xs: T[]): T[] => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** A rules plugin dir under the sandbox; returns the CLAUDE_PLUGIN_ROOT to use. */
const rulesRoot = (sb: Sandbox, tag: string): string => { put(sb, `plugins/${tag}/rules/00-${tag}.md`, `# rule ${tag}\nmarker-${tag}\n`); return join(sb.cwd, "plugins", tag); };
const sessionStart = (sb: Sandbox, id: string): string => JSON.stringify({ hook_event_name: "SessionStart", session_id: id, source: "startup", cwd: sb.cwd });
const eventDir = (sb: Sandbox, payload: string): string => join(sb.home, ".fuse-harness", "rdv", eventKey("claude-code", sb.cwd, payload));
const rules = (sb: Sandbox, payload: string, root: string, env: Record<string, string> = {}) => spawnHook({ host: "claude-code", scope: "rules", payload, sb, env: { CLAUDE_PLUGIN_ROOT: root, ...env } });

let boxes: Sandbox[] = [];
const box = (): Sandbox => { const sb = makeSandbox(true); boxes.push(sb); return sb; };
afterEach(() => { for (const b of boxes) rmSync(b.cwd, { recursive: true, force: true }); boxes = []; });

describe("random arrival order and timing", () => {
  for (const trial of [1, 2, 3]) {
    test(`Codex PostToolUse Bash, shuffled scopes + jitter (trial ${trial})`, async () => {
      noteAttempt(`protocol:random-arrival-${trial}`);
      const payloadFor = codexEvent("PostToolUse", { tool_name: "Bash", tool_use_id: "u", tool_input: { command: "ls" }, tool_response: "ok" });
      const step: Step = { payloadFor, scopes: shuffled(codexScopesFor(payloadFor({ home: "", cwd: "/x" }))), staggerMs: 0, jitterMs: 25 };
      const { steps, stateDiffs } = await runCase({ host: "codex", setup: project, steps: [step] });
      expect(steps[0]?.outputDiffs).toEqual([]);
      expect(steps[0]?.order.length).toBeGreaterThanOrEqual(2);
      expect(stateDiffs).toEqual([]);
    }, { timeout: 120_000, retry: 2 }); // wall-clock-window oracle: see multi-rdv-sim.test.ts
  }
});

describe("leader crash", () => {
  for (const trial of [1, 2, 3]) {
    test(`SIGKILL the leader as soon as it exists: every survivor still prints today's output (trial ${trial})`, async () => {
      const sb = box();
      const root = rulesRoot(sb, "KILL");
      const payload = sessionStart(sb, `kill${trial}`);
      const base = await rules(sb, payload, root, { FUSE_HARNESS_RENDEZVOUS: "0" });
      expect(base.stdout).toContain("marker-KILL");
      const tune = { FUSE_HARNESS_RDV_STEAL_MS: "300", FUSE_HARNESS_RDV_QUIET_MS: "80" };
      const run = Promise.all(Array.from({ length: 6 }, (_, i) => wait(i * 5).then(() => rules(sb, payload, root, tune))));
      const killer = (async () => {
        for (let i = 0; i < 400; i++) {
          const f = join(eventDir(sb, payload), "leader");
          if (existsSync(f)) { try { process.kill(Number(readFileSync(f, "utf8").split(":")[0]), "SIGKILL"); } catch { /* already gone */ } return; }
          await wait(2);
        }
      })();
      const [res] = await Promise.all([run, killer]);
      const survivors = res.filter((r) => r.stdout.length > 0 || r.exit === 0);
      expect(survivors.length).toBeGreaterThanOrEqual(5); // everyone but the killed leader
      for (const r of survivors) { expect(r.stdout).toBe(base.stdout); expect(r.exit).toBe(0); }
    }, 60_000);
  }
});

describe("per-process environment", () => {
  test("each process's own CLAUDE_PLUGIN_ROOT decides what `rules` injects (leader applies it per registration)", async () => {
    const sb = box();
    const tags = ["ONE", "TWO", "THREE"];
    const roots = tags.map((tag) => rulesRoot(sb, tag));
    const payload = sessionStart(sb, "env1");
    const base: Awaited<ReturnType<typeof rules>>[] = [];
    for (const root of roots) base.push(await rules(sb, payload, root, { FUSE_HARNESS_RENDEZVOUS: "0" }));
    const pending = [];
    for (const root of roots) { pending.push(rules(sb, payload, root)); await wait(6); }
    const res = await Promise.all(pending);
    res.forEach((r, i) => {
      expect(r.stdout).toBe(base[i]?.stdout as string);
      expect(r.stdout).toContain(`marker-${tags[i]}`);
    });
    expect(existsSync(join(sb.home, ".fuse-harness", "rdv"))).toBe(true); // they really rendezvoused
  }, 60_000);
});

describe("generations", () => {
  test("a repeated identical event after the stale window forms a NEW set and is served again", async () => {
    const sb = box();
    const root = rulesRoot(sb, "GEN");
    const payload = sessionStart(sb, "gen1");
    const env = { FUSE_HARNESS_RDV_STALE_MS: "300", FUSE_HARNESS_RDV_QUIET_MS: "40" };
    const pair = async (): Promise<void> => { const a = rules(sb, payload, root, env); await wait(5); await Promise.all([a, rules(sb, payload, root, env)]); };
    await pair();
    const first = readFileSync(join(eventDir(sb, payload), "leader"), "utf8");
    await wait(600);
    await pair();
    expect(readFileSync(join(eventDir(sb, payload), "leader"), "utf8")).not.toBe(first); // a fresh leader file = a fresh generation
    expect(readFileSync(join(eventDir(sb, payload), "order"), "utf8").split("\n").filter(Boolean).length).toBe(2);
  }, 60_000);

  test("an identical event INSIDE the stale window is a late arrival: standalone, no trace in the set", async () => {
    const sb = box();
    const root = rulesRoot(sb, "LATE");
    const payload = sessionStart(sb, "late1");
    const env = { FUSE_HARNESS_RDV_STALE_MS: "60000" };
    await rules(sb, payload, root, env);
    const before = readdirSync(eventDir(sb, payload)).sort().join(",");
    const late = await rules(sb, payload, root, env);
    expect(late.stdout).toContain("marker-LATE");
    expect(readdirSync(eventDir(sb, payload)).sort().join(",")).toBe(before);
  }, 60_000);
});
