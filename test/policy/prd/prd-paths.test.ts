import { describe, expect, test } from "bun:test";
import {
  classifyPrdPath, isPrdScopedPath, prdAgentReportPath, prdDir, prdDocsPath,
  prdRouterPath, prdTaskPath,
} from "../../../src/policy/prd/prd-paths";
import type { PrdRouter } from "../../../src/policy/prd/interfaces/types";

const root = "/proj";
const homeSeg = ".claude";

describe("prd-paths builders", () => {
  test("prdRouterPath", () => {
    expect(prdRouterPath(root, homeSeg)).toBe("/proj/.claude/apex/prd.json");
  });
  test("prdDir", () => {
    expect(prdDir(root, homeSeg)).toBe("/proj/.claude/apex/prd");
  });
  test("prdTaskPath resolves relPrd against apex dir", () => {
    expect(prdTaskPath(root, homeSeg, "prd/auth-refactor-prd.json")).toBe(
      "/proj/.claude/apex/prd/auth-refactor-prd.json",
    );
  });
  test("prdAgentReportPath", () => {
    expect(prdAgentReportPath(root, homeSeg, "backend-expert")).toBe(
      "/proj/.claude/apex/prd/agents/backend-expert-prd.json",
    );
  });
  test("prdDocsPath", () => {
    expect(prdDocsPath(root, homeSeg, "auth-refactor")).toBe(
      "/proj/.claude/apex/prd/docs/auth-refactor.md",
    );
  });
});

describe("isPrdScopedPath", () => {
  test("router itself is in scope", () => {
    expect(isPrdScopedPath("/proj/.claude/apex/prd.json", root, homeSeg)).toBe(true);
  });
  test("relative path resolved against root is in scope", () => {
    expect(isPrdScopedPath(".claude/apex/prd/agents/backend-expert-prd.json", root, homeSeg)).toBe(true);
  });
  test("a file outside apex/prd is out of scope", () => {
    expect(isPrdScopedPath("/proj/src/index.ts", root, homeSeg)).toBe(false);
  });
  test("apex dir itself (not prd/) is out of scope", () => {
    expect(isPrdScopedPath("/proj/.claude/apex/other.json", root, homeSeg)).toBe(false);
  });
  test("a .. escape out of the prd dir is rejected", () => {
    expect(isPrdScopedPath("/proj/.claude/apex/prd/../../../etc/passwd", root, homeSeg)).toBe(false);
  });
});

describe("classifyPrdPath", () => {
  const router: PrdRouter = {
    "auth-refactor": { prd: "prd/auth-refactor-prd.json", status: "assigned" },
  };

  test("router path", () => {
    expect(classifyPrdPath("/proj/.claude/apex/prd.json", root, homeSeg, router)).toEqual({ kind: "router" });
  });
  test("task path matched via router", () => {
    expect(classifyPrdPath("/proj/.claude/apex/prd/auth-refactor-prd.json", root, homeSeg, router)).toEqual({
      kind: "task",
      task: "auth-refactor",
    });
  });
  test("agentReport path", () => {
    expect(
      classifyPrdPath("/proj/.claude/apex/prd/agents/backend-expert-prd.json", root, homeSeg, router),
    ).toEqual({ kind: "agentReport", agent: "backend-expert" });
  });
  test("docs path", () => {
    expect(classifyPrdPath("/proj/.claude/apex/prd/docs/auth-refactor.md", root, homeSeg, router)).toEqual({
      kind: "docs",
      task: "auth-refactor",
    });
  });
  test("a task path not matched by a null router falls back to other", () => {
    expect(classifyPrdPath("/proj/.claude/apex/prd/auth-refactor-prd.json", root, homeSeg, null)).toEqual({
      kind: "other",
    });
  });
  test("a stray file directly under prd/ not in the router is other", () => {
    expect(classifyPrdPath("/proj/.claude/apex/prd/stray.json", root, homeSeg, router)).toEqual({ kind: "other" });
  });
  test("out-of-scope path returns null", () => {
    expect(classifyPrdPath("/proj/src/index.ts", root, homeSeg, router)).toBeNull();
  });
});
