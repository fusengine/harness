import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { displayCodeForAction } from "../src/runtime/confirm/confirm-code";
import { approvalGate } from "../src/policy/motion/gates";
import { grantPending, listPending } from "../src/policy/motion/approvals";
import { closeRender } from "../src/policy/motion/budget";
import { sha256File } from "../src/policy/motion/hash";
import { loadMotionProject } from "../src/policy/motion/project";
import { classifyMotionCommand } from "../src/policy/motion/command";
import type { MotionCommand, MotionProject } from "../src/policy/interfaces/motion";

let home: string;
let proj: string;
let project: MotionProject;
const SID = "sess-1";
const STILLS: MotionCommand = { renderStage: "draft", ffmpegMaster: false };
const MASTER: MotionCommand = { renderStage: "master", ffmpegMaster: false };

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "motion-home-"));
  proj = mkdtempSync(join(tmpdir(), "motion-proj-"));
  mkdirSync(join(proj, ".motion", "stills"), { recursive: true });
  mkdirSync(join(proj, "out"), { recursive: true });
  writeFileSync(join(proj, ".motion", "project.json"), JSON.stringify({ render: "render.sh", draft: "out/draft.mp4", masters: ["out/master.mp4"] }));
  const p = loadMotionProject(proj, home);
  if (!p) throw new Error("project not resolved");
  project = p;
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(proj, { recursive: true, force: true });
});

const gate = (cmd: MotionCommand, env: Record<string, string | undefined> = {}) => approvalGate(cmd, project, SID, 1000, home, env);
const reason = (p: ReturnType<typeof gate>): string => p?.reason ?? "";
const writeContact = (s: string): void => writeFileSync(project.contact, s);
const writeDraft = (s: string): void => writeFileSync(project.draft ?? "", s);

/** Approve the artifact at `stage` as the owner would: deny -> pending -> grant. */
function approve(stage: "stills" | "draft", cmd: MotionCommand, path: string): void {
  gate(cmd);
  const sha = sha256File(path);
  const p = listPending(project.root, home).find((x) => x.stage === stage);
  expect(p).toBeDefined();
  expect(grantPending(project.root, SID, stage, p?.code ?? "", sha, 2000, home)).not.toBeNull();
}

test("no gated stage -> null", () => {
  expect(gate({ ffmpegMaster: false })).toBeNull();
  expect(gate({ renderStage: "stills", ffmpegMaster: false })).toBeNull();
});

test("G1 deny: no approval -> instruction + pending recorded with display code", () => {
  writeContact("sheet-v1");
  const p = gate(STILLS);
  const sha = sha256File(project.contact) ?? "";
  const code = displayCodeForAction(sha);
  expect(p?.kind).toBe("block");
  expect(p?.title).toBe("Motion approval gate");
  expect(reason(p)).toContain(`Owner: type MOTION-APPROVE stills ${code}`);
  expect(reason(p)).toContain("Motion budget:");
  const pending = listPending(project.root, home);
  expect(pending).toHaveLength(1);
  expect(pending[0]).toMatchObject({ stage: "stills", sha256: sha, code, sessionId: SID, createdAt: 1000 });
  expect(code).toBe(pending[0]?.code ?? "");
});

test("G1 allow: approval bound to the right hash", () => {
  writeContact("sheet-v1");
  approve("stills", STILLS, project.contact);
  expect(gate(STILLS)).toBeNull();
});

test("G1 stale: contact sheet changed after approval -> deny + stale", () => {
  writeContact("sheet-v1");
  approve("stills", STILLS, project.contact);
  writeContact("sheet-v2");
  const p = gate(STILLS);
  expect(p?.kind).toBe("block");
  expect(reason(p)).toContain("stale: artifact changed since approval");
  expect(reason(p)).toContain("MOTION-APPROVE stills");
});

test("missing contact sheet -> deny without pending", () => {
  const p = gate(STILLS);
  expect(p?.kind).toBe("block");
  expect(reason(p)).toContain("produce the artifact first");
  expect(listPending(project.root, home)).toEqual([]);
});

test("missing draft / undeclared draft -> deny without pending", () => {
  expect(reason(gate(MASTER))).toContain("produce the artifact first");
  writeFileSync(join(proj, ".motion", "project.json"), JSON.stringify({ masters: ["out/master.mp4"] }));
  const bare = loadMotionProject(proj, home);
  const p = approvalGate(MASTER, bare as MotionProject, SID, 1, home, {});
  expect(reason(p)).toContain("produce the artifact first");
  expect(listPending(project.root, home)).toEqual([]);
});

test("G2 deny / allow on the draft hash", () => {
  writeDraft("draft-v1");
  const p = gate(MASTER);
  const code = displayCodeForAction(sha256File(project.draft ?? "") ?? "");
  expect(reason(p)).toContain(`Owner: type MOTION-APPROVE draft ${code}`);
  expect(listPending(project.root, home)[0]?.code).toBe(code);
  approve("draft", MASTER, project.draft ?? "");
  expect(gate(MASTER)).toBeNull();
});

test("G2 stale: draft mp4 modified after approval -> deny + stale", () => {
  writeDraft("draft-v1");
  approve("draft", MASTER, project.draft ?? "");
  writeDraft("draft-v2");
  const p = gate(MASTER);
  expect(p?.kind).toBe("block");
  expect(reason(p)).toContain("stale");
});

test("a stills approval does not unlock the master gate", () => {
  writeContact("sheet-v1");
  writeDraft("draft-v1");
  approve("stills", STILLS, project.contact);
  expect(gate(MASTER)?.kind).toBe("block");
});

test("ffmpeg writing a declared master hits the same gate", () => {
  writeDraft("draft-v1");
  const cmd = classifyMotionCommand(`ffmpeg -i ${project.draft} ${join(proj, "out", "master.mp4")}`, proj, project);
  expect(cmd.ffmpegMaster).toBe(true);
  expect(reason(gate(cmd))).toContain("MOTION-APPROVE draft");
  approve("draft", cmd, project.draft ?? "");
  expect(gate(cmd)).toBeNull();
});

test("master cap: reached -> deny, below -> allow, unset -> no cap", () => {
  writeDraft("draft-v1");
  approve("draft", MASTER, project.draft ?? "");
  closeRender(project.root, undefined, "master", 5, home);
  const cap1 = { FUSE_MOTION_MAX_MASTER_RENDERS: "1" };
  const cap2 = { FUSE_MOTION_MAX_MASTER_RENDERS: "2" };
  expect(reason(gate(MASTER, cap1))).toContain("cap reached (1/1");
  expect(gate(MASTER, cap2)).toBeNull();
  closeRender(project.root, undefined, "master", 6, home);
  expect(gate(MASTER, cap2)?.kind).toBe("block");
  expect(gate(MASTER, {})).toBeNull();
});

test("cap never applies to the draft gate", () => {
  writeContact("sheet-v1");
  approve("stills", STILLS, project.contact);
  closeRender(project.root, undefined, "master", 5, home);
  expect(gate(STILLS, { FUSE_MOTION_MAX_MASTER_RENDERS: "1" })).toBeNull();
});
