import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

test("duplicate patch paths stay bounded without relaxing contract denial", () => {
  const script = `
    import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';
    import { normalizeEvent } from './src/runtime/normalize.ts';
    import { projectContractViolation } from './src/policy/motion/project-guard.ts';
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'motion-perf3-')));
    mkdirSync(join(home, '.motion'));
    const input = '*** Add File: harmless\\n'.repeat(120000);
    const event = normalizeEvent('codex', { tool_name: 'apply_patch', tool_input: { command: input } });
    const start = performance.now();
    const allowed = projectContractViolation(event, home, '/nonhome') === null;
    const ms = performance.now() - start;
    console.log(JSON.stringify({ ms, allowed }));
    event.input.command += '*** Delete File: .motion/project.json\\n';
    const denied = projectContractViolation(event, home, '/nonhome')?.kind === 'block';
    console.log(JSON.stringify({ denied }));
  `;
  const child = spawnSync(process.execPath, ["-e", script], { timeout: 7000, encoding: "utf8" });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  const [result, denial] = child.stdout.trim().split("\n").map((line) => JSON.parse(line)) as [{ ms: number; allowed: boolean }, { denied: boolean }];
  expect(result.allowed).toBe(true);
  expect(denial.denied).toBe(true);
  expect(result.ms).toBeLessThan(500);
}, 8000);
