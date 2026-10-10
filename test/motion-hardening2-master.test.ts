import { afterEach, beforeEach, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { classifyMotionCommand } from "../src/policy/motion/command";
import { criticViolation } from "../src/policy/motion/critic";
import { denied, makeFixture, runHost, shell, type MotionFixture } from "./motion-hosts-fixture";

let fx: MotionFixture;
beforeEach(() => { fx = makeFixture(); });
afterEach(() => { rmSync(fx.base, { recursive: true, force: true }); });

test("Codex critic apply_patch cannot write outside the review pack", async () => {
  const path = join(fx.proj, "src", "a.ts");
  expect(criticViolation("apply_patch", path, undefined, join(fx.proj, ".motion", "review"), fx.proj)?.kind).toBe("block");
  const out = await runHost(fx, "codex", {
    hook_event_name: "PreToolUse", session_id: "s", turn_id: "1", tool_use_id: "p",
    agent_type: "motion-critic", tool_name: "apply_patch", cwd: fx.proj,
    tool_input: { command: `*** Begin Patch\n*** Add File: ${path}\n+const x = 1;\n*** End Patch` },
  });
  expect(denied("codex", out)).toBe(true);
  expect(out).toContain("Motion critic sandbox");
});

test("all declared-master redirects, copies and moves require G2", async () => {
  for (const command of [
    "ffmpeg -i draft.mp4 - >out/master.mp4",
    "ffmpeg -i draft.mp4 /tmp/m.mp4 && mv /tmp/m.mp4 out/master.mp4",
    "ffmpeg -i draft.mp4 /tmp/m.mp4 && cp /tmp/m.mp4 out/master.mp4",
    "printf video >out/master.mp4", "cat /tmp/m.mp4 >>out/master.mp4",
    "tee out/master.mp4", "dd if=/tmp/m.mp4 of=out/master.mp4",
    "mv /tmp/m.mp4 'out/master.mp4'", "cp /tmp/m.mp4 out/master.mp4",
    "cp /tmp/master.mp4 out/", "mv /tmp/master.mp4 out/",
    "cp -t out /tmp/master.mp4", "mv --target-directory=out /tmp/master.mp4",
    "cp -tout /tmp/master.mp4", "mv --target-directory out /tmp/master.mp4",
    "sh -c 'cp /tmp/m.mp4 out/master.mp4'", "sh -c 'printf video >out/master.mp4'",
  ]) {
    const out = await runHost(fx, "claude-code", shell("claude-code", "s", command, fx.proj));
    expect(denied("claude-code", out)).toBe(true);
    expect(out).toContain("Motion approval gate");
  }
});

test("read-only masters and copies from masters are not classified as writes", () => {
  const project = { root: fx.proj, masters: [join(fx.proj, "out", "master.mp4")], sourceDir: join(fx.proj, "src"), reviewDir: join(fx.proj, ".motion", "review"), contact: join(fx.proj, ".motion", "stills", "contact.png") };
  for (const command of ["cat out/master.mp4", "ffprobe out/master.mp4", "ffmpeg -i out/master.mp4 /tmp/thumb.png", "cp out/master.mp4 /tmp/copy.mp4", "cp /tmp/other.mp4 out/", "echo '>out/master.mp4'", "sh -c 'cat out/master.mp4'", "sh -c 'cp out/master.mp4 /tmp/copy.mp4'"]) {
    expect(classifyMotionCommand(command, fx.proj, project).ffmpegMaster).toBe(false);
  }
});

test("literal shell wrappers cannot remove or relocate the motion contract", async () => {
  for (const command of ["sh -c 'rm -rf .motion'", "bash -c 'mv .motion /tmp/review'"]) {
    const out = await runHost(fx, "claude-code", shell("claude-code", "s", command, fx.proj));
    expect(denied("claude-code", out)).toBe(true);
    expect(out).toContain("Motion project contract guard");
  }
});

test("wrapped contract reads and harmless motion scaffolds remain allowed", async () => {
  for (const command of ["sh -c 'cat .motion/project.json'", "bash -c 'mkdir -p .motion/review'", "sh -c 'mkdir -p .motion'"]) {
    const out = await runHost(fx, "claude-code", shell("claude-code", "s", command, fx.proj));
    expect(denied("claude-code", out)).toBe(false);
  }
});
