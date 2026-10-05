import { test, expect } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleHook } from "../src/runtime/handle";
import { apexScopedGate } from "../src/runtime/gate-apex";
import { emptyTrack, recordAgent } from "../src/tracking/session-state";
import { withTrack } from "../src/tracking/store";
import { defaultStateDir, trackFile } from "../src/runtime/paths";
import { lazyRefs } from "../src/refs/lazy";
import { loadRefs } from "../src/refs/loader";
import type { GateInput } from "../src/runtime/gate-input";

const NOW = 1_700_000_000_000;
const tmp = (p: string): string => mkdtempSync(join(tmpdir(), p));
const FM = "---\nname: srp\nlevel: principle\nappliesTo: '**/*.ts'\n---\nbody\n";

/** A refs dir whose scan THROWS (a directory named `bad.md` -> readFile EISDIR). */
function brokenRefs(): string {
  const d = tmp("fh-lazyrefs-bad-");
  mkdirSync(join(d, "bad.md"));
  return d;
}

/** A refs dir with one routable SOLID reference. */
function goodRefs(): string {
  const d = tmp("fh-lazyrefs-ok-");
  const dir = join(d, "skills", "solid-generic", "references");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "single-responsibility.md"), FM);
  return d;
}

const pre = (tool: string, input: Record<string, unknown>, sid = "s-lazy"): Record<string, unknown> => ({ hook_event_name: "PreToolUse", tool_name: tool, session_id: sid, tool_input: input });
const run = (event: Record<string, unknown>, refsDir: string | undefined, cwd: string) => handleHook("claude-code", event, { now: NOW, cwd, refsDir, home: tmp("fh-lazyrefs-home-") });
const settle = (p: Promise<unknown>): Promise<string> => p.then(() => "ok", (e: { code?: string }) => `throw:${e.code}`);

/** Representative PreToolUse events for `cwd`, one session id per call (deny-loop state is per session). */
function events(cwd: string, sid: string): Record<string, Record<string, unknown>> {
  const p = (tool: string, input: Record<string, unknown>) => pre(tool, input, sid);
  return {
    bash: p("Bash", { command: "ls -la" }),
    "read code": p("Read", { file_path: join(cwd, "src", "a.ts") }),
    "read md": p("Read", { file_path: join(cwd, "README.md") }),
    "write non-code": p("Write", { file_path: join(cwd, "notes.txt"), content: "hi\n" }),
    "protected path": p("Write", { file_path: join(cwd, ".claude", "logs", "00-apex", "x.ts"), content: "{}" }),
    "skip dir": p("Write", { file_path: join(cwd, "node_modules", "x", "i.ts"), content: "export const x = 1;\n" }),
    "trivial edit": p("Edit", { file_path: join(cwd, "src", "a.ts"), old_string: "a", new_string: "b" }),
    "code write": p("Write", { file_path: join(cwd, "src", "w.ts"), content: "export const w = 1;\n".repeat(40) }),
  };
}

test("lazy refs: an unreadable refs dir fails EVERY event exactly like the old eager load (same rejection, even for Bash)", async () => {
  const cwd = tmp("fh-lazyrefs-cwd-");
  const bad = brokenRefs();
  const oldBehaviour = await settle(loadRefs(bad)); // what main's handle-pre line 107 did
  expect(oldBehaviour).toBe("throw:EISDIR");
  for (const [name, ev] of Object.entries(events(cwd, "s-bad"))) expect({ name, got: await settle(run(ev, bad, cwd)) }).toEqual({ name, got: oldBehaviour });
});

test("lazy refs: a valid refs dir changes no outcome for any event (vs no refs dir at all)", async () => {
  const cwd = tmp("fh-lazyrefs-cwd1-");
  const good = goodRefs();
  const [withRefs, without] = [events(cwd, "s-good"), events(cwd, "s-none")];
  for (const name of Object.keys(withRefs)) {
    expect({ name, ...(await run(withRefs[name]!, good, cwd)) }).toEqual({ name, ...(await run(without[name]!, undefined, cwd)) });
  }
});

test("lazy refs: reaching the refs consumers with an unreadable refs dir is still a rejection (and PRE-gate denies come first)", async () => {
  const cwd = tmp("fh-lazyrefs-cwd2-");
  const ev = pre("Write", { file_path: join(cwd, "src", "new.ts"), content: "export const n = 1;\n".repeat(40) });
  await withTrack(trackFile("s-lazy", defaultStateDir(cwd)), (t) => ["subagent-explore-codebase", "subagent-research-expert"].reduce((acc, n) => recordAgent(acc, n, NOW, "sufficient"), t));
  await expect(run(ev, brokenRefs(), cwd)).rejects.toMatchObject({ code: "EISDIR" });
});

test("lazy refs: APEX gate result identical via the lazy thunk and via eager refs; loads once, only past early returns and PRE gates", async () => {
  const dir = goodRefs();
  const eager = await loadRefs(dir);
  expect(eager.length).toBe(1);
  let t = emptyTrack();
  for (const n of ["subagent-explore-codebase", "subagent-research-expert"]) t = recordAgent(t, n, NOW, "sufficient");
  const trackFileP = join(tmp("fh-lazyrefs-track-"), "track.json");
  const mk = (over: Partial<GateInput>): GateInput => ({ sessionId: "s-lazy", framework: "generic", tool: "Write", filePath: "src/new.ts", content: "export const n = 1;\n".repeat(40), cwd: "/x", now: NOW, trackFile: trackFileP, windowMs: 120_000, ...over });
  const viaEager = await apexScopedGate(mk({ refs: eager }), t, 120_000);
  let calls = 0;
  const thunk = await lazyRefs(dir);
  const counted = async () => { calls++; return thunk(); };
  const viaLazy = await apexScopedGate(mk({ loadRefs: counted }), t, 120_000);
  expect(viaLazy).toEqual(viaEager);
  expect(viaLazy?.reason).toContain("Read ALL SOLID references");
  expect(calls).toBe(1);
  for (const filePath of ["/p/.claude/logs/00-apex/x.ts", "/p/node_modules/a/b.ts"]) await apexScopedGate(mk({ filePath, loadRefs: counted }), t, 120_000);
  await apexScopedGate(mk({ tool: "Edit", content: "b", loadRefs: counted }), t, 120_000);
  expect((await apexScopedGate(mk({ loadRefs: counted }), emptyTrack(), 120_000))?.title).toContain("explore");
  expect(calls).toBe(1);
});

test("lazyRefs: scan is deferred to first use and memoized (one load shared by every caller)", async () => {
  const dir = goodRefs();
  const thunk = await lazyRefs(dir);
  writeFileSync(join(dir, "skills", "solid-generic", "references", "late.md"), FM.replace("srp", "late")); // added AFTER lazyRefs(): only a deferred scan sees it
  const first = thunk(), second = thunk();
  expect(first).toBe(second);
  expect((await first)?.map((r) => r.name).sort()).toEqual(["late", "srp"]);
  expect(await (await lazyRefs(undefined))()).toBeUndefined();
});

/** Build a random refs tree mixing valid refs with the failure shapes readFile can hit. */
function randomTree(seed: number): string {
  let s = seed;
  const rnd = (n: number): number => { s = (s * 1664525 + 1013904223) % 4294967296; return s % n; };
  const root = tmp("fh-lazyrefs-rand-");
  for (let i = 0, n = 2 + rnd(8); i < n; i++) {
    const sub = join(root, ...["a", "b/c", "d/e/f", ""].slice(0, 1 + rnd(4)).slice(-1));
    mkdirSync(sub, { recursive: true });
    const p = join(sub, `r${i}.md`);
    const kind = rnd(10); // mostly valid; 1 in 10 each: dir-as-.md, dangling symlink, mode 000
    if (kind === 0) mkdirSync(p);
    else if (kind === 1) symlinkSync(join(root, "nope-target"), p);
    else if (kind === 2) { writeFileSync(p, FM); chmodSync(p, 0o000); }
    else if (kind === 3) writeFileSync(join(sub, `r${i}.txt`), "ignored");
    else writeFileSync(p, FM.replace("srp", `r${i}`));
  }
  return root;
}

test("lazyRefs vs loadRefs property: 120 random trees — same throw/no-throw, same error code, same refs", async () => {
  let throwing = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const dir = randomTree(seed);
    const old = await loadRefs(dir).then((r) => ({ ok: r }), (e: { code?: string }) => ({ err: e.code }));
    const now = await lazyRefs(dir).then(async (th) => ({ ok: await th() }), (e: { code?: string }) => ({ err: e.code }));
    if ("err" in old) throwing++;
    // loadRefs returns readdir order, which is unspecified and can differ between two calls (seen on Linux CI):
    // the property is "same refs, same error" — compare the refs as a set, sorted by path.
    const byPath = (r: { ok?: { filePath: string }[]; err?: string }) => ("ok" in r && r.ok ? { ok: [...r.ok].sort((x, y) => x.filePath.localeCompare(y.filePath)) } : r);
    expect({ seed, ...byPath(now) }).toEqual({ seed, ...byPath(old) });
  }
  expect(throwing).toBeGreaterThan(10); // the failure shapes were actually exercised
});
