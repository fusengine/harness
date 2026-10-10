import { test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyMotionCommand, ffmpegWritesMaster, invokesRender, renderStage } from "../src/policy/motion/command";
import type { MotionProject } from "../src/policy/interfaces/motion";

const root = realpathSync(mkdtempSync(join(tmpdir(), "motion-cmd-")));
mkdirSync(join(root, "out"));
const proj = (over: Partial<MotionProject> = {}): MotionProject => ({
  root,
  masters: [join(root, "out", "master.mp4")],
  sourceDir: root,
  reviewDir: join(root, ".motion", "review"),
  contact: join(root, ".motion", "stills", "contact.png"),
  ...over,
});
const stage = (cmd: string, p: MotionProject = proj()): string | undefined => classifyMotionCommand(cmd, root, p).renderStage;

test("--stage draft -> draft", () => {
  expect(stage("bun render.sh --stage draft")).toBe("draft");
  expect(stage("./render.sh --stage draft")).toBe("draft");
});

test("no --stage -> stills", () => {
  expect(stage("./render.sh")).toBe("stills");
  expect(stage("bash render.sh --fps 30")).toBe("stills");
});

test("--stage=master and non-literal values -> master", () => {
  expect(stage("./render.sh --stage=master")).toBe("master");
  expect(stage('./render.sh --stage "$S"')).toBe("master");
  expect(stage("./render.sh --stage $S")).toBe("master");
  expect(stage("./render.sh --stage 'master'")).toBe("master");
});

test("sh -c wrapper is still caught", () => {
  expect(stage('sh -c "./render.sh --stage master"')).toBe("master");
  expect(stage("bash -c './render.sh --stage draft'")).toBe("draft");
});

test("highest stage wins across chained invocations", () => {
  expect(stage("./render.sh --stage draft && ./render.sh --stage master")).toBe("master");
  expect(renderStage("x --stage stills --stage draft")).toBe("draft");
});

test("unrelated commands -> undefined", () => {
  expect(stage("echo hi")).toBeUndefined();
  expect(stage("ls out/render")).toBeUndefined();
  expect(stage("cat render.sh")).toBe("stills"); // conservative: names the entry (over-match costs one approval)
});

test("render.sh.bak and lookalikes do not match", () => {
  expect(invokesRender("cat render.sh.bak", undefined)).toBe(false);
  expect(invokesRender("./my-render.sh --stage master", undefined)).toBe(false);
  expect(invokesRender("./render.shx", undefined)).toBe(false);
});

test("render declared as a command string", () => {
  const p = proj({ render: "bun scripts/render.ts" });
  expect(stage("bun scripts/render.ts --stage draft", p)).toBe("draft");
  expect(stage("bun   scripts/render.ts", p)).toBe("stills");
  expect(stage("bun scripts/other.ts", p)).toBeUndefined();
});

test("render declared as a script path matches by basename", () => {
  const p = proj({ render: "scripts/build-video.ts" });
  expect(stage("bun scripts/build-video.ts --stage=master", p)).toBe("master");
  expect(stage("bun scripts/build-video.ts.bak", p)).toBeUndefined();
});

test("ffmpeg writing the master -> true", () => {
  const m = [join(root, "out", "master.mp4")];
  expect(ffmpegWritesMaster("ffmpeg -y -i draft.mp4 out/master.mp4", root, m)).toBe(true);
  expect(ffmpegWritesMaster(`ffmpeg -y -i draft.mp4 ${m[0]}`, root, m)).toBe(true);
  expect(ffmpegWritesMaster("/usr/bin/ffmpeg -i a.mp4 -c copy out/master.mp4", root, m)).toBe(true);
  expect(ffmpegWritesMaster("ffmpeg -i a.mp4 'out/master.mp4'", root, m)).toBe(true);
  expect(ffmpegWritesMaster("echo go && ffmpeg -i a.mp4 out/master.mp4", root, m)).toBe(true);
});

test("ffmpeg inside a sh -c payload is caught", () => {
  const m = [join(root, "out", "master.mp4")];
  expect(ffmpegWritesMaster('sh -c "ffmpeg -y -i draft.mp4 out/master.mp4"', root, m)).toBe(true);
  expect(ffmpegWritesMaster("bash -c 'ffmpeg -i out/master.mp4 thumb.png'", root, m)).toBe(false);
});

test("ffmpeg reading the master (-i) -> false", () => {
  const m = [join(root, "out", "master.mp4")];
  expect(ffmpegWritesMaster("ffmpeg -i out/master.mp4 thumb.png", root, m)).toBe(false);
  expect(ffmpegWritesMaster("ffprobe out/master.mp4", root, m)).toBe(false);
  expect(ffmpegWritesMaster("ffmpeg -i a.mp4 out/other.mp4", root, m)).toBe(false);
});

test("relative paths resolve against cwd, not the project root", () => {
  const m = [join(root, "out", "master.mp4")];
  expect(ffmpegWritesMaster("ffmpeg -i a.mp4 master.mp4", join(root, "out"), m)).toBe(true);
  expect(ffmpegWritesMaster("ffmpeg -i a.mp4 master.mp4", root, m)).toBe(false);
});

test("no masters declared -> false", () => {
  expect(ffmpegWritesMaster("ffmpeg -i a.mp4 out/master.mp4", root, [])).toBe(false);
});

test("macOS /var vs /private/var aliases compare equal", () => {
  if (process.platform !== "darwin") return;
  const alias = root.replace(/^\/private/, "");
  expect(alias).not.toBe(root);
  const m = [join(root, "out", "master.mp4")];
  expect(ffmpegWritesMaster(`ffmpeg -i a.mp4 ${join(alias, "out", "master.mp4")}`, root, m)).toBe(true);
  expect(ffmpegWritesMaster("ffmpeg -i a.mp4 out/master.mp4", alias, m)).toBe(true);
});

test("classifyMotionCommand reports both facets", () => {
  const r = classifyMotionCommand("./render.sh --stage draft", root, proj());
  expect(r).toEqual({ renderStage: "draft", ffmpegMaster: false });
  const f = classifyMotionCommand("ffmpeg -i d.mp4 out/master.mp4", root, proj());
  expect(f).toEqual({ renderStage: undefined, ffmpegMaster: true });
});
