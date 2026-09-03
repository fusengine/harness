import { describe, expect, test } from "bun:test";
import {
  candidateAgentNames, evaluateWriteOwnership, matchesAgentName, resolveOwnerBinding,
} from "../../../src/policy/prd/prd-ownership";
import type { PrdIdentity, PrdTaskFile } from "../../../src/policy/prd/interfaces/types";

describe("matchesAgentName", () => {
  test("exact match", () => {
    expect(matchesAgentName("backend-expert", "backend-expert")).toBe(true);
  });
  test("suffixed with n >= 2", () => {
    expect(matchesAgentName("backend-expert-2", "backend-expert")).toBe(true);
  });
  test("rejects -1 suffix", () => {
    expect(matchesAgentName("backend-expert-1", "backend-expert")).toBe(false);
  });
  test("rejects non-numeric suffix", () => {
    expect(matchesAgentName("backend-expert-x", "backend-expert")).toBe(false);
  });
  test("rejects a name that merely starts with the type", () => {
    expect(matchesAgentName("backend-expertise", "backend-expert")).toBe(false);
  });
});

describe("candidateAgentNames", () => {
  const taskFile: PrdTaskFile = {
    "backend-expert": { files: [], "sub-tasks": {} },
    "backend-expert-2": { files: [], "sub-tasks": {} },
    "frontend-expert": { files: [], "sub-tasks": {} },
  };
  test("filters task-file agents by name match", () => {
    expect(candidateAgentNames("backend-expert", taskFile).sort()).toEqual(["backend-expert", "backend-expert-2"]);
  });
  test("empty when nothing matches", () => {
    expect(candidateAgentNames("ghost-expert", taskFile)).toEqual([]);
  });
});

describe("resolveOwnerBinding", () => {
  test("already bound to the same id", () => {
    const result = resolveOwnerBinding(["a", "b"], "id-1", { "id-1": "a" });
    expect(result).toEqual({ name: "a", alreadyBound: true });
  });
  test("bound to a different id -> excluded, other candidate free", () => {
    const result = resolveOwnerBinding(["a", "b"], "id-2", { "id-1": "a" });
    expect(result).toEqual({ name: "b", alreadyBound: false });
  });
  test("single free candidate binds", () => {
    const result = resolveOwnerBinding(["a"], "id-1", {});
    expect(result).toEqual({ name: "a", alreadyBound: false });
  });
  test("two free candidates -> ambiguous, null", () => {
    expect(resolveOwnerBinding(["a", "b"], "id-1", {})).toBeNull();
  });
  test("zero candidates -> null", () => {
    expect(resolveOwnerBinding([], "id-1", {})).toBeNull();
  });
});

describe("evaluateWriteOwnership", () => {
  const taskFile: PrdTaskFile = {
    "backend-expert": { files: ["a.ts"], "sub-tasks": { jwt: { status: "assigned" } } },
    "backend-expert-2": { files: ["b.ts"], "sub-tasks": { session: { status: "assigned" } } },
  };
  const lead: PrdIdentity = { lead: true };
  const sub = (agentType: string, agentId = "id-1"): PrdIdentity => ({ lead: false, agentType, agentId });
  const unknown: PrdIdentity = { lead: "unknown" };

  for (const kind of [{ kind: "router" as const }, { kind: "task" as const, task: "t" }, { kind: "docs" as const, task: "t" }]) {
    test(`${kind.kind}: lead allowed, sub denied, unknown advisory`, () => {
      expect(evaluateWriteOwnership({ kind, identity: lead, taskFile: null, bindings: {} })).toEqual({ allow: true });
      const subVerdict = evaluateWriteOwnership({ kind, identity: sub("backend-expert"), taskFile: null, bindings: {} });
      expect(subVerdict.allow).toBe(false);
      expect(evaluateWriteOwnership({ kind, identity: unknown, taskFile: null, bindings: {} })).toEqual({ allow: "advisory" });
    });
  }

  test("agentReport: lead denied", () => {
    const verdict = evaluateWriteOwnership({
      kind: { kind: "agentReport", agent: "backend-expert" }, identity: lead, taskFile, bindings: {},
    });
    expect(verdict.allow).toBe(false);
  });
  test("agentReport: sub allowed when its own name is the sole free candidate", () => {
    const verdict = evaluateWriteOwnership({
      kind: { kind: "agentReport", agent: "backend-expert" },
      identity: sub("backend-expert"), taskFile, bindings: { "id-9": "backend-expert-2" },
    });
    expect(verdict).toEqual({ allow: true, bind: { agentId: "id-1", name: "backend-expert" } });
  });
  test("agentReport: sub denied when target belongs to a different agent name", () => {
    const verdict = evaluateWriteOwnership({
      kind: { kind: "agentReport", agent: "backend-expert-2" },
      identity: sub("backend-expert"), taskFile, bindings: {},
    });
    expect(verdict.allow).toBe(false);
  });
  test("agentReport: sub denied when already bound to a different agentId", () => {
    const verdict = evaluateWriteOwnership({
      kind: { kind: "agentReport", agent: "backend-expert" },
      identity: sub("backend-expert", "id-2"), taskFile, bindings: { "id-1": "backend-expert" },
    });
    expect(verdict.allow).toBe(false);
  });
  test("agentReport: agent_id present without agent_type -> deny (fail-closed)", () => {
    const verdict = evaluateWriteOwnership({
      kind: { kind: "agentReport", agent: "backend-expert" },
      identity: { lead: false, agentId: "id-1" }, taskFile, bindings: {},
    });
    expect(verdict.allow).toBe(false);
  });
  test("agentReport: unknown lead is always advisory", () => {
    const verdict = evaluateWriteOwnership({
      kind: { kind: "agentReport", agent: "backend-expert" }, identity: unknown, taskFile, bindings: {},
    });
    expect(verdict).toEqual({ allow: "advisory" });
  });

  test("other: denied for lead and sub, advisory for unknown", () => {
    expect(evaluateWriteOwnership({ kind: { kind: "other" }, identity: lead, taskFile: null, bindings: {} }).allow).toBe(false);
    expect(evaluateWriteOwnership({ kind: { kind: "other" }, identity: sub("backend-expert"), taskFile: null, bindings: {} }).allow).toBe(false);
    expect(evaluateWriteOwnership({ kind: { kind: "other" }, identity: unknown, taskFile: null, bindings: {} })).toEqual({ allow: "advisory" });
  });
});
