import { expect, test, spyOn } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { motionHook } from "../src/runtime/motion";
import { normalizeEvent } from "../src/runtime/normalize";
import * as projectModule from "../src/policy/motion/project-command";

const home = realpathSync(mkdtempSync(join(tmpdir(), "motion-routing3-")));
const a = join(home, "a");
const b = join(home, "video");
for (const root of [a, b]) {
  mkdirSync(join(root, ".motion"), { recursive: true });
  writeFileSync(join(root, ".motion/project.json"), JSON.stringify({ render: "render.sh", masters: ["out/master.mp4"] }));
}
async function run(command: string, cwd = home): Promise<string> {
  const payload = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } };
  return (await motionHook("claude-code", payload, normalizeEvent("claude-code", payload), { cwd, home, now: 1 })).stdout;
}
test("source motion project cannot steal a destination project's G2", async () => {
  expect(await run(`cp ${a}/input.mp4 out/master.mp4`, b)).toContain("Cannot approve");
  expect(await run(`cp ${a}/render.sh out/master.mp4`, b)).toContain("Cannot approve");
});
test("literal shell-c child project cd contexts survive quoted separators", async () => {
  expect(await run('bash -c "cd video && ./render.sh master"')).toContain("Cannot approve");
});
test("cd -- resolves its literal directory, not the option", async () => {
  expect(await run("cd -- video && ./render.sh master")).toContain("Cannot approve");
});
test("multiple protected projects fail closed rather than choosing the first", async () => {
  expect(await run(`bash ${a}/render.sh master && cp /tmp/a out/master.mp4`, b)).toContain("protected decision failed");
  expect(projectModule.commandMotionProject(`bash ${a}/render.sh master`, b, home)?.root).toBe(a);
  expect(await run(`cp ${a}/input.mp4 /tmp/unrelated.mp4`, b)).toBe("");
});
test("initial discovery faults preserve known child scope and outside fail-open", async () => {
  const spy = spyOn(projectModule, "commandMotionProject").mockImplementation(() => { throw new Error("initial routing failure"); });
  try {
    expect(await run("bash video/render.sh --stage master")).toContain("protected decision failed");
    expect(await run("git status")).toBe("");
  } finally { spy.mockRestore(); }
});
