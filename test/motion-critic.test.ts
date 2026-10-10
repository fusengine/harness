import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { criticViolation } from "../src/policy/motion/critic";
import { activeCritics, addActiveCritic, isCriticAgentType, removeActiveCritic } from "../src/policy/motion/critic-flag";
import { readJsonObject, sessionStateFile, writeJsonObject } from "../src/policy/motion/store";

let cwd: string;
let review: string;
let home: string;

beforeEach(() => {
  cwd = realpathSync(mkdtempSync(join(tmpdir(), "motion-critic-")));
  review = join(cwd, ".motion", "review");
  home = mkdtempSync(join(tmpdir(), "motion-chome-"));
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

const read = (p: string) => criticViolation("Read", p, undefined, review, cwd);
const bash = (c: string) => criticViolation("Bash", undefined, c, review, cwd);
const blocked = (c: string): boolean => bash(c)?.kind === "block";

test("Write/Edit/MultiEdit/NotebookEdit -> block", () => {
  for (const t of ["Write", "Edit", "MultiEdit", "NotebookEdit"]) {
    expect(criticViolation(t, join(review, "a.md"), undefined, review, cwd)?.kind).toBe("block");
  }
});

test("Read: media ok, source block, review dir ok", () => {
  expect(read(join(cwd, "out", "a.png"))).toBeNull();
  expect(read("out/a.MP4")).toBeNull();
  expect(read(join(cwd, "src", "index.ts"))?.kind).toBe("block");
  expect(read("src/index.ts")?.kind).toBe("block");
  expect(read(join(review, "notes.md"))).toBeNull();
  expect(read(".motion/review/notes.md")).toBeNull();
  expect(read(join(cwd, ".motion", "review-evil", "x.md"))?.kind).toBe("block");
  expect(read(join(review, "..", "project.json"))?.kind).toBe("block");
});

test("Read without a path -> block; unrelated tools -> null", () => {
  expect(criticViolation("Read", undefined, undefined, review, cwd)?.kind).toBe("block");
  expect(criticViolation("Glob", "x", undefined, review, cwd)).toBeNull();
});

test("Bash: ffprobe / ls / stat ok", () => {
  expect(bash("ffprobe a.mp4")).toBeNull();
  expect(bash("ffprobe -v error -show_streams a.mp4 | ls")).toBeNull();
  expect(bash("stat a.mp4")).toBeNull();
  expect(bash(`ls -la ${review}`)).toBeNull();
  expect(bash("ffprobe -v error -show_entries format=duration a.mp4")).toBeNull();
  expect(bash(`ffmpeg -ss 5 -t 2.5 -i a.mp4 -frames:v 1 ${review}/f.png`)).toBeNull();
  expect(bash(`ffmpeg -i a.mp4 -vf subtitles=a.srt -metadata t=x.mp4 ${review}/f.png`)).toBeNull();
  expect(blocked("ls &> /tmp/x")).toBe(true);
  expect(bash("/opt/homebrew/bin/ffprobe a.mp4")).toBeNull();
});

test("Bash: ffmpeg output inside the review dir ok, outside block", () => {
  expect(bash(`ffmpeg -i a.mp4 ${review}/f.png`)).toBeNull();
  expect(bash(`ffmpeg -y -ss 1.5 -i a.mp4 -vf scale=640:-1 -frames:v 1 ${review}/f.png`)).toBeNull();
  expect(bash("ffmpeg -i a.mp4 .motion/review/f.png")).toBeNull();
  expect(blocked("ffmpeg -i a.mp4 out/x.png")).toBe(true);
  expect(blocked("ffmpeg -i a.mp4 out/extensionless")).toBe(true);
  expect(blocked(`ffmpeg -i a.mp4 ${review}/../x.png`)).toBe(true);
});

test("Bash: bare ffmpeg output and ~ output block", () => {
  expect(blocked("ffmpeg -i a.mp4 out")).toBe(true);
  expect(blocked("ffmpeg -i a.mp4 ~")).toBe(true);
  expect(blocked("ffmpeg -i a.mp4 ~/x.png")).toBe(true);
});

test("Bash: redirections", () => {
  expect(bash("ffprobe a.mp4 > /dev/null")).toBeNull();
  expect(bash("ffprobe a.mp4 2>/dev/null")).toBeNull();
  expect(bash("ffprobe a.mp4 2>&1")).toBeNull();
  expect(bash(`ffprobe a.mp4 > ${review}/probe.txt`)).toBeNull();
  expect(blocked("ffprobe a.mp4 > probe.txt")).toBe(true);
  expect(blocked("ls >> /tmp/x")).toBe(true);
});

test("Bash: forbidden verbs and shapes -> block", () => {
  for (const c of ["rm x", "ls | sh", "ls & rm x", "ls && cat secrets.txt", "ffprobe $(cat x)", "ffprobe `cat x`", "ffprobe <(cat x)", "ls >(sh)", "python3 -c 1"]) {
    expect(blocked(c)).toBe(true);
  }
  expect(criticViolation("Bash", undefined, undefined, review, cwd)).toBeNull();
});

test("Bash: eval / xargs / sh / env prefixes -> block", () => {
  for (const c of ["eval ls", "ls | xargs rm", "ffprobe a.mp4 | bash", "env ls", "FFREPORT=file=/tmp/r.log ffprobe a.mp4", "VAR=1 rm x", "command rm x", "ls; /tmp/ls"]) {
    expect(blocked(c)).toBe(true);
  }
});

test("Bash: verb lookalike by path is not trusted", () => {
  expect(blocked("/tmp/ls")).toBe(true);
  expect(blocked("./stat x")).toBe(true);
  expect(blocked("../ffprobe x")).toBe(true);
  expect(bash("/usr/bin/ls")).toBeNull();
});

test("Bash: indirect ffmpeg writes -> block", () => {
  const out = "-i a.mp4";
  for (const extra of [
    "-progress /tmp/p.txt", "-progress=/tmp/p.txt", "-report", "-vstats_file /tmp/v", "-vstats", "-dump_attachment:t out.bin",
    "-passlogfile /tmp/l", "-f tee x", "-f segment x", "-f hls x", "-f dash x", "-f=tee x",
    "-segment_list /tmp/l.csv", "-hls_segment_filename /tmp/s%d.ts", "-sdp_file /tmp/s.sdp",
  ]) {
    expect(blocked(`ffmpeg ${out} ${extra} ${review}/f.png`)).toBe(true);
  }
  expect(blocked(`ffmpeg ${out} ${review}/f.png -report`)).toBe(true);
});

test("Bash: -f image2 / -f null / -progress to the review dir stay allowed", () => {
  expect(bash(`ffmpeg -i a.mp4 -f image2 ${review}/f%d.png`)).toBeNull();
  expect(bash("ffmpeg -i a.mp4 -f null -")).toBeNull();
  expect(bash(`ffmpeg -i a.mp4 -progress ${review}/p.txt ${review}/f.png`)).toBeNull();
  expect(bash(`ffmpeg -i a.mp4 -passlogfile ${review}/l ${review}/f.png`)).toBeNull();
});

test("critic-flag: add/remove by agent_id, several critics, unknown id", () => {
  expect(activeCritics("s1", home)).toEqual([]);
  addActiveCritic("s1", "a1", home);
  addActiveCritic("s1", "a2", home);
  addActiveCritic("s1", "a1", home);
  expect(activeCritics("s1", home)).toEqual(["a1", "a2"]);
  removeActiveCritic("s1", "ghost", home);
  expect(activeCritics("s1", home)).toEqual(["a1", "a2"]);
  removeActiveCritic("s1", "a1", home);
  expect(activeCritics("s1", home)).toEqual(["a2"]);
  removeActiveCritic("s1", "a2", home);
  expect(activeCritics("s1", home)).toEqual([]);
});

test("critic-flag: add/remove keep the other session keys", () => {
  const file = sessionStateFile("s1", home) ?? "";
  writeJsonObject(file, { other: { n: 1 }, critics: ["a0"] });
  addActiveCritic("s1", "a1", home);
  expect(readJsonObject(file)).toEqual({ other: { n: 1 }, critics: ["a0", "a1"] });
  removeActiveCritic("s1", "a0", home);
  expect(readJsonObject(file)).toEqual({ other: { n: 1 }, critics: ["a1"] });
});

test("critic-flag: sessions are isolated; invalid session id is inert", () => {
  addActiveCritic("s1", "a1", home);
  expect(activeCritics("s2", home)).toEqual([]);
  addActiveCritic("../evil", "a1", home);
  addActiveCritic(undefined, "a1", home);
  expect(activeCritics("../evil", home)).toEqual([]);
  removeActiveCritic(42 as unknown, "a1", home);
  expect(activeCritics("s1", home)).toEqual(["a1"]);
});

test("isCriticAgentType", () => {
  expect(isCriticAgentType("fuse-motion:motion-critic")).toBe(true);
  expect(isCriticAgentType("motion-critic")).toBe(true);
  expect(isCriticAgentType("fuse-motion:motion-designer")).toBe(false);
  expect(isCriticAgentType("motion-critic-x")).toBe(false);
  expect(isCriticAgentType("")).toBe(false);
});
