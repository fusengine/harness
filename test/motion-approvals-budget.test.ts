import { test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dropPending, grantPending, listApprovals, listPending, recordPending } from "../src/policy/motion/approvals";
import { validMotionApproval } from "../src/policy/motion/auth-approval";
import { MAX_MASTER_ENV, budgetLine, closeRender, loadBudget, maxMasterRenders, openRender } from "../src/policy/motion/budget";
import { projectStoreDir } from "../src/policy/motion/store";
import type { MotionPending } from "../src/policy/interfaces/motion";

const tmp = (): string => realpathSync(mkdtempSync(join(tmpdir(), "motion-ab-")));
const pend = (over: Partial<MotionPending> = {}): MotionPending => ({
  stage: "draft", artifact: "/p/out/draft.mp4", sha256: "aa".repeat(32), code: "ab12", createdAt: 1, sessionId: "s1", ...over,
});
function setup(): { root: string; home: string } {
  const root = tmp();
  mkdirSync(join(root, ".motion"));
  return { root, home: tmp() };
}

test("recordPending replaces same stage+session, keeps others", () => {
  const { root, home } = setup();
  recordPending(root, pend({ code: "0001" }), home);
  recordPending(root, pend({ code: "0002" }), home);
  recordPending(root, pend({ sessionId: "s2", code: "0003" }), home);
  recordPending(root, pend({ stage: "stills", code: "0004" }), home);
  const codes = listPending(root, home).map((p) => p.code).sort();
  expect(codes).toEqual(["0002", "0003", "0004"]);
});

test("dropPending removes every pending of one session only", () => {
  const { root, home } = setup();
  recordPending(root, pend(), home);
  recordPending(root, pend({ stage: "stills" }), home);
  recordPending(root, pend({ sessionId: "s2" }), home);
  dropPending(root, "s1", home);
  expect(listPending(root, home).map((p) => p.sessionId)).toEqual(["s2"]);
  dropPending(root, "ghost", home);
  expect(listPending(root, home)).toHaveLength(1);
});

test("grantPending: right code + hash writes the approval, clears pending, mirrors the log", () => {
  const { root, home } = setup();
  recordPending(root, pend(), home);
  const a = grantPending(root, "s1", "draft", "AB12", "aa".repeat(32), 1_700_000_000_000, home);
  expect(a).toMatchObject({ stage: "draft", sha256: "aa".repeat(32), sessionId: "s1", approvedAt: 1_700_000_000_000 });
  expect(validMotionApproval(root, listApprovals(root, home)[0], "draft", "aa".repeat(32), "/p/out/draft.mp4", home)).toBe(true);
  expect(validMotionApproval(root, listApprovals(root, home)[0], "stills", "aa".repeat(32), "/p/out/draft.mp4", home)).toBe(false);
  expect(listApprovals(root, home)).toHaveLength(1);
  expect(listPending(root, home)).toEqual([]);
  const log = readFileSync(join(root, ".motion", "approvals.log"), "utf8");
  expect(log).toContain(`draft ${"aa".repeat(32)} /p/out/draft.mp4`);
  grantPending(root, "s1", "draft", "ab12", "aa".repeat(32), 1, home); // nothing pending any more
  expect(listApprovals(root, home)).toHaveLength(1);
});

test("grantPending denies on wrong code / stage / session / hash / null sha", () => {
  const { root, home } = setup();
  recordPending(root, pend(), home);
  const sha = "aa".repeat(32);
  expect(grantPending(root, "s1", "draft", "ffff", sha, 1, home)).toBeNull();
  expect(grantPending(root, "s1", "stills", "ab12", sha, 1, home)).toBeNull();
  expect(grantPending(root, "s2", "draft", "ab12", sha, 1, home)).toBeNull();
  expect(grantPending(root, "s1", "draft", "ab12", "bb".repeat(32), 1, home)).toBeNull();
  expect(grantPending(root, "s1", "draft", "ab12", null, 1, home)).toBeNull();
  expect(listApprovals(root, home)).toEqual([]);
  expect(listPending(root, home)).toHaveLength(1);
  expect(existsSync(join(root, ".motion", "approvals.log"))).toBe(false);
});

test("a grant failing to mirror the log still approves", () => {
  const { root, home } = setup();
  recordPending(root, pend(), home);
  writeFileSync(join(root, ".motion", "approvals.log"), "");
  expect(grantPending(root, "s1", "draft", "ab12", "aa".repeat(32), 1, home)).not.toBeNull();
});

test("corrupt stores read as empty", () => {
  const { root, home } = setup();
  recordPending(root, pend(), home);
  const dir = projectStoreDir(root, home);
  writeFileSync(join(dir, "pending.json"), "{oops");
  writeFileSync(join(dir, "approvals.json"), '{"approvals": "nope"}');
  expect(listPending(root, home)).toEqual([]);
  expect(listApprovals(root, home)).toEqual([]);
  expect(listApprovals(root, home)).toEqual([]);
  expect(grantPending(root, "s1", "draft", "ab12", "aa".repeat(32), 1, home)).toBeNull();
  writeFileSync(join(dir, "approvals.json"), '{"approvals": [null, 3, {"stage":"draft","sha256":"x"}]}');
  expect(listApprovals(root, home) as unknown[]).toEqual([null, 3, { stage: "draft", sha256: "x" }]);
  expect(validMotionApproval(root, listApprovals(root, home)[2], "draft", "x", "/p/out/draft.mp4", home)).toBe(false);
});

test("budget: open/close count renders and accumulate wall time", () => {
  const { root, home } = setup();
  openRender(root, "t1", "draft", 1000, home);
  expect(Object.keys(loadBudget(root, home).inflight)).toEqual(["t1"]);
  closeRender(root, "t1", "master", 4500, home);
  openRender(root, "t2", "draft", 10_000, home);
  const b = closeRender(root, "t2", "master", 12_000, home);
  expect(b.renders).toEqual({ draft: 2 });
  expect(b.wallMs).toEqual({ draft: 5500 });
  expect(b.inflight).toEqual({});
  expect(loadBudget(root, home)).toEqual(b);
});

test("closeRender without start counts +1 on the fallback stage, 0 ms", () => {
  const { root, home } = setup();
  const b = closeRender(root, "ghost", "master", 99, home);
  expect(b.renders).toEqual({ master: 1 });
  expect(b.wallMs).toEqual({ master: 0 });
  expect(closeRender(root, undefined, "master", 99, home).renders).toEqual({ master: 2 });
  openRender(root, undefined, "draft", 1, home); // no id: no-op
  expect(loadBudget(root, home).inflight).toEqual({});
});

test("a clock going backwards never yields negative time; a corrupt budget is never repaired by closeRender", () => {
  const { root, home } = setup();
  openRender(root, "t", "draft", 5000, home);
  expect(closeRender(root, "t", "master", 1000, home).wallMs.draft).toBe(0);
  const dir = projectStoreDir(root, home);
  const corrupt = JSON.stringify({ renders: { master: "3" }, wallMs: { master: "x" }, inflight: { t: { stage: "bogus", ts: "no" } } });
  writeFileSync(join(dir, "budget.json"), corrupt);
  expect(() => closeRender(root, "t", "master", 9, home)).toThrow("Motion budget is corrupt");
  expect(readFileSync(join(dir, "budget.json"), "utf8")).toBe(corrupt);
  expect(openRender(root, "t2", "draft", 10, home)?.reason).toContain("Motion budget is corrupt");
});

test("loadBudget on a missing/corrupt file is all-empty", () => {
  const { root, home } = setup();
  expect(loadBudget(root, home)).toEqual({ renders: {}, wallMs: {}, inflight: {} });
  mkdirSync(projectStoreDir(root, home), { recursive: true });
  writeFileSync(join(projectStoreDir(root, home), "budget.json"), "[[");
  expect(loadBudget(root, home)).toEqual({ renders: {}, wallMs: {}, inflight: {} });
});

test("maxMasterRenders reads the injected env; 0/abc/negative/unset -> 0", () => {
  expect(maxMasterRenders({ [MAX_MASTER_ENV]: "3" })).toBe(3);
  for (const v of ["0", "abc", "-2", "1.5", "", undefined]) expect(maxMasterRenders({ [MAX_MASTER_ENV]: v })).toBe(0);
  expect(maxMasterRenders({})).toBe(0);
});

test("budgetLine format", () => {
  const b = { renders: { stills: 2, draft: 1 }, wallMs: { stills: 60_000, draft: 132_000 }, inflight: {} };
  expect(budgetLine(b, {})).toBe("Motion budget: renders stills 2 · draft 1 · master 0 — wall 3m12s");
  expect(budgetLine(b, { [MAX_MASTER_ENV]: "2" })).toContain("master 0/2");
  expect(budgetLine({ renders: {}, wallMs: {}, inflight: {} }, {})).toContain("wall 0m00s");
});
