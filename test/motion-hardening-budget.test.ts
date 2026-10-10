import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { closeRender, loadBudget, MAX_MASTER_ENV, openRender } from "../src/policy/motion/budget";
import { projectStoreDir } from "../src/policy/motion/store";

const fixture = (): { root: string; home: string } => ({
  root: realpathSync(mkdtempSync(join(tmpdir(), "motion-budget-root-"))),
  home: realpathSync(mkdtempSync(join(tmpdir(), "motion-budget-home-"))),
});

async function concurrent(root: string, home: string, body: string): Promise<string[]> {
  const module = resolve("src/policy/motion/budget.ts");
  const barrier = join(home, "start");
  const children = Array.from({ length: 8 }, (_, i) => {
    const script = `import {openRender,closeRender} from ${JSON.stringify(module)};
      import {existsSync,writeFileSync} from 'node:fs';
      const root=${JSON.stringify(root)},home=${JSON.stringify(home)},id=${i};
      writeFileSync(home+'/ready-'+id,'');
      const deadline=Date.now()+10000;
      while(!existsSync(${JSON.stringify(barrier)})) {
        if(Date.now()>deadline) process.exit(2);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2);
      }
      ${body}`;
    const child = spawn(process.execPath, ["--eval", script], { stdio: ["ignore", "pipe", "pipe"] });
    const output: string[] = [], errors: string[] = [];
    child.stdout.on("data", (data: Buffer) => output.push(data.toString()));
    child.stderr.on("data", (data: Buffer) => errors.push(data.toString()));
    const result = new Promise<string>((resolveResult, reject) => {
      const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("worker timed out")); }, 12000);
      child.on("error", (error) => { clearTimeout(timeout); reject(error); });
      child.on("exit", (code) => {
        clearTimeout(timeout);
        if (code !== 0) reject(new Error(`worker ${i} exited ${code}: ${errors.join("")}`));
        else resolveResult(output.join(""));
      });
    });
    return { child, result };
  });
  try {
    const deadline = Date.now() + 10000;
    while (!children.every((_, i) => existsSync(join(home, `ready-${i}`)))) {
      if (Date.now() > deadline) throw new Error("workers not ready");
      await new Promise<void>((resolveWait) => setTimeout(resolveWait, 5));
    }
    writeFileSync(barrier, "");
    return await Promise.all(children.map(({ result }) => result));
  } finally {
    for (const { child } of children) if (child.exitCode === null) child.kill("SIGKILL");
  }
}

test("D5: concurrent completions never lose increments or wall time", async () => {
  const { root, home } = fixture();
  await concurrent(root, home, `for(let i=0;i<60;i++) {
    openRender(root,id+'-'+i,'draft',1,home,{});
    closeRender(root,id+'-'+i,'draft',11,home);
  }`);
  const budget = loadBudget(root, home);
  expect(budget.renders.draft).toBe(480);
  expect(budget.wallMs.draft).toBe(4800);
  expect(budget.inflight).toEqual({});
}, 15000);

test("D5: concurrent master admissions reserve the cap before completion", async () => {
  const { root, home } = fixture();
  const results = await concurrent(root, home,
    `console.log(!openRender(root,'master-'+id,'master',1,home,{FUSE_MOTION_MAX_MASTER_RENDERS:'2'}) ? 'allowed' : 'blocked');`);
  expect(results.filter((r) => r.trim() === "allowed")).toHaveLength(2);
  expect(Object.keys(loadBudget(root, home).inflight)).toHaveLength(2);
}, 15000);

test("D5: cap includes completed renders and inflight reservations", () => {
  const { root, home } = fixture(), env = { [MAX_MASTER_ENV]: "2" };
  closeRender(root, "past", "master", 1, home);
  expect(openRender(root, "one", "master", 2, home, env)).toBeNull();
  expect(openRender(root, "two", "master", 2, home, env)?.kind).toBe("block");
  closeRender(root, "one", "master", 3, home);
  expect(openRender(root, "three", "master", 4, home, env)?.kind).toBe("block");
});

test("D5: an active cap without a reservation id fails closed", () => {
  const { root, home } = fixture();
  expect(openRender(root, undefined, "master", 1, home, { [MAX_MASTER_ENV]: "1" })?.kind).toBe("block");
  expect(loadBudget(root, home).inflight).toEqual({});
});

test("D5: duplicate inflight ids cannot overwrite a master reservation or bypass the cap", () => {
  const { root, home } = fixture(), env = { [MAX_MASTER_ENV]: "2" };
  expect(openRender(root, "same", "master", 1, home, env)).toBeNull();
  expect(openRender(root, "same", "master", 2, home, env)?.kind).toBe("block");
  expect(openRender(root, "same", "draft", 3, home, env)?.kind).toBe("block");
  expect(loadBudget(root, home).inflight.same).toEqual({ stage: "master", ts: 1 });
  expect(openRender(root, "different", "master", 4, home, env)).toBeNull();
  expect(openRender(root, "third", "master", 5, home, env)?.kind).toBe("block");
});

test("D5: corrupt persisted cap data cannot reset the render allowance", () => {
  const { root, home } = fixture(), dir = projectStoreDir(root, home);
  mkdirSync(dir, { recursive: true });
  for (const raw of ["{bad", "{}", '{"renders":{"master":"2"},"wallMs":{},"inflight":{}}',
    '{"renders":{},"wallMs":{},"inflight":{"x":null}}']) {
    writeFileSync(join(dir, "budget.json"), raw);
    expect(openRender(root, "one", "master", 1, home, { [MAX_MASTER_ENV]: "2" })?.kind).toBe("block");
  }
});

test("D5: acquiring the budget lock preserves private store directory permissions", () => {
  const { root, home } = fixture();
  openRender(root, "one", "draft", 1, home, {});
  expect(statSync(projectStoreDir(root, home)).mode & 0o777).toBe(0o700);
});

test("D5: busy lock denies admission and never overwrites budget, with bounded wait", () => {
  const { root, home } = fixture(), dir = projectStoreDir(root, home);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "track.lock"), "held");
  const started = performance.now();
  expect(openRender(root, "one", "master", 1, home, { [MAX_MASTER_ENV]: "1" })?.kind).toBe("block");
  expect(() => closeRender(root, "one", "master", 2, home)).toThrow("Motion budget lock busy");
  expect(performance.now() - started).toBeLessThan(3500);
  expect(loadBudget(root, home)).toEqual({ renders: {}, wallMs: {}, inflight: {} });
}, 5000);
