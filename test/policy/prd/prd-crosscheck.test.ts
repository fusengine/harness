import { describe, expect, test } from "bun:test";
import {
  crossCheckRouter, crossCheckTask, hasAnyViolations, incompleteSubTasks,
} from "../../../src/policy/prd/prd-crosscheck";
import type { PrdAgentReportFile, PrdRouter, PrdTaskFile } from "../../../src/policy/prd/interfaces/types";

const taskFile: PrdTaskFile = {
  "backend-expert": { files: ["a.ts"], "sub-tasks": { jwt: { status: "validated", "validated-at": "t" } } },
  "backend-expert-2": { files: ["b.ts"], "sub-tasks": { session: { status: "validated", "validated-at": "t" } } },
};

describe("crossCheckTask", () => {
  test("validated sub-task without a matching done report -> violation", () => {
    const reports: Record<string, PrdAgentReportFile> = {
      "backend-expert": {},
      "backend-expert-2": { t: { session: { status: "done", modified: ["b.ts"], unchanged: [] } } },
    };
    const violations = crossCheckTask(taskFile, reports, "t");
    expect(violations).toEqual([
      { task: "t", agent: "backend-expert", sub: "jwt", reason: "validated without a matching done report" },
    ]);
  });
  test("validated with a matching done report -> no violation", () => {
    const reports: Record<string, PrdAgentReportFile> = {
      "backend-expert": { t: { jwt: { status: "done", modified: ["a.ts"], unchanged: [] } } },
      "backend-expert-2": { t: { session: { status: "done", modified: ["b.ts"], unchanged: [] } } },
    };
    expect(crossCheckTask(taskFile, reports, "t")).toEqual([]);
  });
  test("a compacted (already-validated) entry is ignored, not re-checked", () => {
    const compactedTaskFile: PrdTaskFile = {
      "backend-expert": { status: "validated", files: ["a.ts"], "validated-at": "t" },
      "backend-expert-2": { files: ["b.ts"], "sub-tasks": { session: { status: "assigned" } } },
    };
    expect(crossCheckTask(compactedTaskFile, {}, "t")).toEqual([]);
  });
  test("an assigned (not yet validated) sub-task never produces a violation", () => {
    const assignedTaskFile: PrdTaskFile = {
      a: { files: [], "sub-tasks": { x: { status: "assigned" } } },
      b: { files: [], "sub-tasks": { y: { status: "assigned" } } },
    };
    expect(crossCheckTask(assignedTaskFile, {}, "t")).toEqual([]);
  });
});

describe("crossCheckRouter", () => {
  test("router says validated but the task-PRD still has an assigned sub-task -> violation", () => {
    const stillAssigned: PrdTaskFile = {
      a: { files: [], "sub-tasks": { x: { status: "validated", "validated-at": "t" } } },
      b: { files: [], "sub-tasks": { y: { status: "assigned" } } },
    };
    const router: PrdRouter = { t: { prd: "prd/t-prd.json", status: "validated" } };
    expect(crossCheckRouter(router, { t: stillAssigned }).length).toBe(1);
  });
  test("router says validated and the task-PRD agrees -> no violation", () => {
    const router: PrdRouter = { t: { prd: "prd/t-prd.json", status: "validated" } };
    expect(crossCheckRouter(router, { t: taskFile })).toEqual([]);
  });
  test("a null task file (unparseable) under a validated router entry is a violation", () => {
    const router: PrdRouter = { t: { prd: "prd/t-prd.json", status: "validated" } };
    expect(crossCheckRouter(router, { t: null }).length).toBe(1);
  });
  test("a non-validated router entry is never cross-checked", () => {
    const router: PrdRouter = { t: { prd: "prd/t-prd.json", status: "assigned" } };
    expect(crossCheckRouter(router, { t: null })).toEqual([]);
  });
});

describe("incompleteSubTasks", () => {
  test("sub-tasks assigned to the agent that are not done in its own report", () => {
    const report: PrdAgentReportFile = { t: { jwt: { status: "done", modified: ["a.ts"], unchanged: [] } } };
    const twoSubs: PrdTaskFile = {
      "backend-expert": {
        files: [], "sub-tasks": { jwt: { status: "assigned" }, mfa: { status: "assigned" } },
      },
      other: { files: [], "sub-tasks": { x: { status: "assigned" } } },
    };
    expect(incompleteSubTasks(twoSubs, "backend-expert", "t", report)).toEqual(["mfa"]);
  });
  test("null report -> every sub-task is incomplete", () => {
    expect(incompleteSubTasks(taskFile, "backend-expert", "t", null)).toEqual(["jwt"]);
  });
  test("compacted agent entry has nothing incomplete", () => {
    const compactedTaskFile: PrdTaskFile = {
      "backend-expert": { status: "validated", files: [], "validated-at": "t" },
      other: { files: [], "sub-tasks": {} },
    };
    expect(incompleteSubTasks(compactedTaskFile, "backend-expert", "t", null)).toEqual([]);
  });
});

describe("hasAnyViolations", () => {
  test("true when crossCheckRouter finds anything", () => {
    const router: PrdRouter = { t: { prd: "prd/t-prd.json", status: "validated" } };
    expect(hasAnyViolations(router, { t: null })).toBe(true);
  });
  test("false when clean", () => {
    const router: PrdRouter = { t: { prd: "prd/t-prd.json", status: "assigned" } };
    const assignedTaskFile: PrdTaskFile = {
      a: { files: [], "sub-tasks": { x: { status: "assigned" } } },
      b: { files: [], "sub-tasks": { y: { status: "assigned" } } },
    };
    expect(hasAnyViolations(router, { t: assignedTaskFile })).toBe(false);
  });
});
