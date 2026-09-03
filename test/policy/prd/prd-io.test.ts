import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readAgentReport, readAgentReportSync, readAllTaskFiles, readRouter, readRouterSync,
  readTaskFile, readTaskFileSync, writeAgentReport, writeRouter, writeTaskFile,
} from "../../../src/policy/prd/prd-io";
import { prdAgentReportPath, prdRouterPath, prdTaskPath } from "../../../src/policy/prd/prd-paths";
import type { PrdAgentReportFile, PrdRouter, PrdTaskFile } from "../../../src/policy/prd/interfaces/types";

const homeSeg = ".claude";

function withTmpDir(fn: (root: string) => Promise<void> | void): () => Promise<void> {
  return async () => {
    const root = mkdtempSync(join(tmpdir(), "fh-prd-io-"));
    try {
      await fn(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

describe("router I/O", () => {
  const router: PrdRouter = { t: { prd: "prd/t-prd.json", status: "assigned" } };

  test("writeRouter then readRouter round-trips", withTmpDir(async (root) => {
    await writeRouter(root, homeSeg, router);
    expect(await readRouter(root, homeSeg)).toEqual(router);
    expect(readRouterSync(root, homeSeg)).toEqual(router);
  }));
  test("missing router file -> null (both variants)", withTmpDir(async (root) => {
    expect(await readRouter(root, homeSeg)).toBeNull();
    expect(readRouterSync(root, homeSeg)).toBeNull();
  }));
  test("corrupt router JSON content -> null (both variants)", withTmpDir(async (root) => {
    const path = prdRouterPath(root, homeSeg);
    mkdirSync(join(root, homeSeg, "apex"), { recursive: true });
    writeFileSync(path, "{not json", "utf8");
    expect(await readRouter(root, homeSeg)).toBeNull();
    expect(readRouterSync(root, homeSeg)).toBeNull();
  }));
});

describe("task-PRD I/O", () => {
  const taskFile: PrdTaskFile = {
    a: { files: ["a.ts"], "sub-tasks": { x: { status: "assigned" } } },
    b: { files: ["b.ts"], "sub-tasks": { y: { status: "assigned" } } },
  };
  const relPrd = "prd/t-prd.json";

  test("writeTaskFile then readTaskFile round-trips", withTmpDir(async (root) => {
    await writeTaskFile(root, homeSeg, relPrd, taskFile);
    expect(await readTaskFile(root, homeSeg, relPrd)).toEqual(taskFile);
    expect(readTaskFileSync(root, homeSeg, relPrd)).toEqual(taskFile);
  }));
  test("missing task file -> null", withTmpDir(async (root) => {
    expect(await readTaskFile(root, homeSeg, relPrd)).toBeNull();
    expect(readTaskFileSync(root, homeSeg, relPrd)).toBeNull();
  }));
  test("readAllTaskFiles reads every router-declared task, null for missing ones", withTmpDir(async (root) => {
    await writeTaskFile(root, homeSeg, relPrd, taskFile);
    const router: PrdRouter = {
      t: { prd: relPrd, status: "assigned" },
      ghost: { prd: "prd/ghost-prd.json", status: "assigned" },
    };
    const all = await readAllTaskFiles(root, homeSeg, router);
    expect(all.t).toEqual(taskFile);
    expect(all.ghost).toBeNull();
  }));
});

describe("agent report I/O", () => {
  const report: PrdAgentReportFile = { t: { x: { status: "done", modified: ["a.ts"], unchanged: [] } } };

  test("writeAgentReport then readAgentReport round-trips", withTmpDir(async (root) => {
    await writeAgentReport(root, homeSeg, "backend-expert", report);
    expect(await readAgentReport(root, homeSeg, "backend-expert")).toEqual(report);
    expect(readAgentReportSync(root, homeSeg, "backend-expert")).toEqual(report);
  }));
  test("missing agent report -> null", withTmpDir(async (root) => {
    expect(await readAgentReport(root, homeSeg, "backend-expert")).toBeNull();
    expect(readAgentReportSync(root, homeSeg, "backend-expert")).toBeNull();
  }));
  test("corrupt agent report JSON -> null", withTmpDir(async (root) => {
    const path = prdAgentReportPath(root, homeSeg, "backend-expert");
    mkdirSync(join(root, homeSeg, "apex", "prd", "agents"), { recursive: true });
    writeFileSync(path, "not json at all", "utf8");
    expect(await readAgentReport(root, homeSeg, "backend-expert")).toBeNull();
    expect(readAgentReportSync(root, homeSeg, "backend-expert")).toBeNull();
  }));
});
