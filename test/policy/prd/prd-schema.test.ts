import { describe, expect, test } from "bun:test";
import {
  filesOf, isCompacted, parseAgentReportFile, parseRouter, parseTaskFile, subTasksOf,
  validateTaskFileInvariant, withRouterStatus, withSubTaskValidated,
} from "../../../src/policy/prd/prd-schema";
import type {
  PrdAgentEntryCompacted, PrdAgentEntryExpanded, PrdRouter, PrdTaskFile,
} from "../../../src/policy/prd/interfaces/types";

describe("parseRouter", () => {
  test("valid router", () => {
    const raw = { "auth-refactor": { prd: "prd/auth-refactor-prd.json", status: "assigned" } };
    expect(parseRouter(raw)).toEqual(raw as PrdRouter);
  });
  test("compacted (same shape, extra validated-at)", () => {
    const raw = {
      "auth-refactor": { prd: "prd/auth-refactor-prd.json", status: "validated", "validated-at": "2026-01-01T00:00:00.000Z" },
    };
    expect(parseRouter(raw)).toEqual(raw as PrdRouter);
  });
  test("invalid JSON shape -> null", () => {
    expect(parseRouter("not an object")).toBeNull();
    expect(parseRouter(null)).toBeNull();
    expect(parseRouter(42)).toBeNull();
  });
  test("missing required field -> null", () => {
    expect(parseRouter({ "auth-refactor": { status: "assigned" } })).toBeNull();
    expect(parseRouter({ "auth-refactor": { prd: "x.json" } })).toBeNull();
  });
  test("bad status enum -> null", () => {
    expect(parseRouter({ "auth-refactor": { prd: "x.json", status: "bogus" } })).toBeNull();
  });
});

describe("parseTaskFile", () => {
  test("valid expanded task file", () => {
    const raw = {
      "backend-expert": { files: ["a.ts"], "sub-tasks": { jwt: { status: "assigned" } } },
    };
    expect(parseTaskFile(raw)).toEqual(raw as PrdTaskFile);
  });
  test("valid compacted task file", () => {
    const raw = {
      "backend-expert": { status: "validated", files: ["a.ts"], "validated-at": "2026-01-01T00:00:00.000Z" },
    };
    expect(parseTaskFile(raw)).toEqual(raw as PrdTaskFile);
  });
  test("invalid JSON -> null", () => {
    expect(parseTaskFile([])).toBeNull();
    expect(parseTaskFile(null)).toBeNull();
  });
  test("missing fields -> null", () => {
    expect(parseTaskFile({ "backend-expert": { files: ["a.ts"] } })).toBeNull();
    expect(parseTaskFile({ "backend-expert": { "sub-tasks": {} } })).toBeNull();
  });
});

describe("parseAgentReportFile", () => {
  test("valid report", () => {
    const raw = { "auth-refactor": { jwt: { status: "done", modified: ["a.ts"], unchanged: [] } } };
    expect(parseAgentReportFile(raw)).toEqual(raw as ReturnType<typeof parseAgentReportFile>);
  });
  test("invalid JSON -> null", () => {
    expect(parseAgentReportFile("nope")).toBeNull();
  });
  test("missing fields -> null", () => {
    expect(parseAgentReportFile({ "auth-refactor": { jwt: { status: "done" } } })).toBeNull();
  });
});

describe("isCompacted / subTasksOf / filesOf", () => {
  const expanded: PrdAgentEntryExpanded = { files: ["a.ts"], "sub-tasks": { jwt: { status: "assigned" } } };
  const compacted: PrdAgentEntryCompacted = { status: "validated", files: ["a.ts"], "validated-at": "t" };

  test("isCompacted distinguishes the two shapes", () => {
    expect(isCompacted(expanded)).toBe(false);
    expect(isCompacted(compacted)).toBe(true);
  });
  test("subTasksOf returns {} for compacted, the map for expanded", () => {
    expect(subTasksOf(expanded)).toEqual({ jwt: { status: "assigned" } });
    expect(subTasksOf(compacted)).toEqual({});
  });
  test("filesOf returns files for both shapes", () => {
    expect(filesOf(expanded)).toEqual(["a.ts"]);
    expect(filesOf(compacted)).toEqual(["a.ts"]);
  });
});

describe("validateTaskFileInvariant", () => {
  test("errors when fewer than 2 agents", () => {
    const oneAgent: PrdTaskFile = { a: { files: [], "sub-tasks": {} } };
    expect(validateTaskFileInvariant(oneAgent).length).toBeGreaterThan(0);
  });
  test("no errors with 2+ agents", () => {
    const twoAgents: PrdTaskFile = {
      a: { files: [], "sub-tasks": {} },
      b: { files: [], "sub-tasks": {} },
    };
    expect(validateTaskFileInvariant(twoAgents)).toEqual([]);
  });
});

describe("withRouterStatus / withSubTaskValidated (immutable builders)", () => {
  test("withRouterStatus updates status and validated-at without mutating input", () => {
    const router: PrdRouter = { t: { prd: "prd/t-prd.json", status: "assigned" } };
    const next = withRouterStatus(router, "t", "validated", "2026-01-01T00:00:00.000Z");
    expect(next.t).toEqual({ prd: "prd/t-prd.json", status: "validated", "validated-at": "2026-01-01T00:00:00.000Z" });
    expect(router.t?.status).toBe("assigned");
  });
  test("withSubTaskValidated flips one sub-task without mutating input", () => {
    const taskFile: PrdTaskFile = { a: { files: [], "sub-tasks": { jwt: { status: "assigned" } } } };
    const next = withSubTaskValidated(taskFile, "a", "jwt", "2026-01-01T00:00:00.000Z");
    const nextEntry = next.a as PrdAgentEntryExpanded;
    expect(nextEntry["sub-tasks"].jwt).toEqual({ status: "validated", "validated-at": "2026-01-01T00:00:00.000Z" });
    const prevEntry = taskFile.a as PrdAgentEntryExpanded;
    expect(prevEntry["sub-tasks"].jwt?.status).toBe("assigned");
  });
});
