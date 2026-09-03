import { describe, expect, test } from "bun:test";
import { canPromoteRouterEntry, compactAgentEntry, compactTaskFile } from "../../../src/policy/prd/prd-compact";
import type { PrdAgentEntryExpanded, PrdTaskFile } from "../../../src/policy/prd/interfaces/types";

const AT = "2026-01-01T00:00:00.000Z";

describe("compactAgentEntry", () => {
  test("every sub-task validated -> collapses to compacted shape", () => {
    const entry: PrdAgentEntryExpanded = {
      files: ["a.ts"],
      "sub-tasks": { jwt: { status: "validated", "validated-at": AT }, mfa: { status: "validated", "validated-at": AT } },
    };
    expect(compactAgentEntry(entry, AT)).toEqual({ status: "validated", files: ["a.ts"], "validated-at": AT });
  });
  test("one sub-task still assigned -> unchanged", () => {
    const entry: PrdAgentEntryExpanded = {
      files: ["a.ts"],
      "sub-tasks": { jwt: { status: "validated", "validated-at": AT }, mfa: { status: "assigned" } },
    };
    expect(compactAgentEntry(entry, AT)).toEqual(entry);
  });
  test("already compacted -> unchanged (idempotent)", () => {
    const entry = { status: "validated" as const, files: ["a.ts"], "validated-at": AT };
    expect(compactAgentEntry(entry, AT)).toEqual(entry);
  });
});

describe("compactTaskFile", () => {
  test("collapses every fully-validated agent, reports which ones", () => {
    const taskFile: PrdTaskFile = {
      a: { files: ["a.ts"], "sub-tasks": { x: { status: "validated", "validated-at": AT } } },
      b: { files: ["b.ts"], "sub-tasks": { y: { status: "assigned" } } },
    };
    const { file, compacted } = compactTaskFile(taskFile, AT);
    expect(compacted).toEqual(["a"]);
    expect(file.a).toEqual({ status: "validated", files: ["a.ts"], "validated-at": AT });
    expect(file.b).toEqual(taskFile.b);
  });
  test("nothing to compact -> empty compacted list, unchanged file", () => {
    const taskFile: PrdTaskFile = { a: { files: [], "sub-tasks": { x: { status: "assigned" } } } };
    const { file, compacted } = compactTaskFile(taskFile, AT);
    expect(compacted).toEqual([]);
    expect(file).toEqual(taskFile);
  });
});

describe("canPromoteRouterEntry", () => {
  test("true when every agent is compacted+validated", () => {
    const taskFile: PrdTaskFile = {
      a: { status: "validated", files: [], "validated-at": AT },
      b: { status: "validated", files: [], "validated-at": AT },
    };
    expect(canPromoteRouterEntry(taskFile)).toBe(true);
  });
  test("false when at least one agent is not compacted", () => {
    const taskFile: PrdTaskFile = {
      a: { status: "validated", files: [], "validated-at": AT },
      b: { files: [], "sub-tasks": { y: { status: "validated", "validated-at": AT } } },
    };
    expect(canPromoteRouterEntry(taskFile)).toBe(false);
  });
});
