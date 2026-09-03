import { describe, expect, test } from "bun:test";
import { agentSlice, agentSlices, joinContextResponses, renderAgentSliceMarkdown } from "../../../src/policy/prd/prd-context";
import type { PrdSubagentSlice, PrdTaskFile } from "../../../src/policy/prd/interfaces/types";

describe("agentSlice", () => {
  const taskFile: PrdTaskFile = {
    "backend-expert": { files: ["src/auth/login.ts"], "sub-tasks": { "jwt-validation": { status: "assigned" } } },
    "backend-expert-2": { files: ["src/auth/session.ts"], "sub-tasks": { "session-store": { status: "assigned" } } },
  };

  test("builds the slice for a single matching candidate", () => {
    expect(agentSlice(taskFile, "backend-expert-2", "auth-refactor")).toEqual({
      task: "auth-refactor", agent: "backend-expert-2", subTasks: ["session-store"], files: ["src/auth/session.ts"],
    });
  });
  test("null when the agent type matches nothing", () => {
    expect(agentSlice(taskFile, "frontend-expert", "auth-refactor")).toBeNull();
  });
  test("null when the agent type is ambiguous (matches 2+ candidates)", () => {
    const ambiguous: PrdTaskFile = {
      "backend-expert": { files: [], "sub-tasks": {} },
      "backend-expert-2": { files: [], "sub-tasks": {} },
    };
    expect(agentSlice(ambiguous, "backend-expert", "t")).toBeNull();
  });
});

describe("agentSlices (plural — surfaces every candidate on ambiguity)", () => {
  const ambiguous: PrdTaskFile = {
    "backend-expert": { files: ["src/auth/login.ts"], "sub-tasks": { "jwt-validation": { status: "assigned" } } },
    "backend-expert-2": { files: ["src/auth/session.ts"], "sub-tasks": { "session-store": { status: "assigned" } } },
  };

  test("two candidates -> one slice per candidate", () => {
    expect(agentSlices(ambiguous, "backend-expert", "auth-refactor")).toEqual([
      { task: "auth-refactor", agent: "backend-expert", subTasks: ["jwt-validation"], files: ["src/auth/login.ts"] },
      { task: "auth-refactor", agent: "backend-expert-2", subTasks: ["session-store"], files: ["src/auth/session.ts"] },
    ]);
  });
  test("a single candidate -> the same one-slice array agentSlice implies", () => {
    expect(agentSlices(ambiguous, "backend-expert-2", "auth-refactor")).toEqual([
      { task: "auth-refactor", agent: "backend-expert-2", subTasks: ["session-store"], files: ["src/auth/session.ts"] },
    ]);
  });
  test("zero candidates -> empty array", () => {
    expect(agentSlices(ambiguous, "frontend-expert", "auth-refactor")).toEqual([]);
  });
});

describe("renderAgentSliceMarkdown", () => {
  const singleSliceBlock = [
    "## PRD assignment — task auth-refactor",
    "Your files: src/auth/login.ts",
    "Your sub-tasks: jwt-validation",
    "Report to prd/agents/backend-expert-prd.json when done.",
  ].join("\n");

  test("renders a readable block: title, files, sub-tasks, report path", () => {
    const slices: PrdSubagentSlice[] = [
      { task: "auth-refactor", agent: "backend-expert", subTasks: ["jwt-validation"], files: ["src/auth/login.ts"] },
    ];
    const text = renderAgentSliceMarkdown(slices);
    expect(text).toContain("## PRD assignment — task auth-refactor");
    expect(text).toContain("src/auth/login.ts");
    expect(text).toContain("jwt-validation");
    expect(text).toContain("prd/agents/backend-expert-prd.json");
  });
  test("a single candidate renders byte-for-byte the same as before (no ambiguity header)", () => {
    const slices: PrdSubagentSlice[] = [
      { task: "auth-refactor", agent: "backend-expert", subTasks: ["jwt-validation"], files: ["src/auth/login.ts"] },
    ];
    expect(renderAgentSliceMarkdown(slices)).toBe(singleSliceBlock);
  });
  test("two slices sharing the same task (ambiguous) -> explicit header + both tranches", () => {
    const slices: PrdSubagentSlice[] = [
      { task: "auth-refactor", agent: "backend-expert", subTasks: ["jwt-validation"], files: ["src/auth/login.ts"] },
      { task: "auth-refactor", agent: "backend-expert-2", subTasks: ["session-store"], files: ["src/auth/session.ts"] },
    ];
    const text = renderAgentSliceMarkdown(slices);
    expect(text).toContain(
      "Several assignments match your agent type. You are ONE of: backend-expert, backend-expert-2. "
      + "The first report you write binds your name; write only that report.",
    );
    expect(text).toContain("## PRD assignment — task auth-refactor");
    expect(text).toContain("prd/agents/backend-expert-prd.json");
    expect(text).toContain("prd/agents/backend-expert-2-prd.json");
  });
  test("two slices from two DIFFERENT tasks are not flagged as ambiguous (no header)", () => {
    const slices: PrdSubagentSlice[] = [
      { task: "auth-refactor", agent: "backend-expert", subTasks: ["jwt-validation"], files: ["src/auth/login.ts"] },
      { task: "billing", agent: "backend-expert", subTasks: ["invoice"], files: ["src/billing.ts"] },
    ];
    expect(renderAgentSliceMarkdown(slices)).not.toContain("Several assignments match");
  });
  test("empty slices -> empty string", () => {
    expect(renderAgentSliceMarkdown([])).toBe("");
  });
});

describe("joinContextResponses", () => {
  test("merges two additionalContext responses into one", () => {
    const a = JSON.stringify({ hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: "A" } });
    const b = JSON.stringify({ hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: "B" } });
    const merged = JSON.parse(joinContextResponses(a, b)) as { hookSpecificOutput: { additionalContext: string } };
    expect(merged.hookSpecificOutput.additionalContext).toBe("A\n\nB");
  });
  test("empty parts produce an empty string", () => {
    expect(joinContextResponses("", "")).toBe("");
  });

  // RED (measured defect): cline's native `{contextModification}` shape (see
  // runtime/respond.ts's "cline" branch) parses fine as JSON but has no
  // `hookSpecificOutput` key, so the old contextTextOf's `?? ""` silently
  // dropped it — a real, non-empty PRD slice reduced to "" and filtered out
  // by `.filter(Boolean)`. Fails before the fix (merged === ""), passes after.
  test("recognizes cline's native {contextModification} shape instead of silently dropping it", () => {
    const clinePart = JSON.stringify({ contextModification: "PRD assignment for cline — session-store" });
    const merged = joinContextResponses(clinePart);
    expect(merged).not.toBe("");
    const parsed = JSON.parse(merged) as { contextModification?: string };
    expect(parsed.contextModification).toContain("session-store");
  });

  test("re-shapes the merge as {contextModification} when a cline-native part is combined with a Claude-shaped part, so cline's own consumer can still read it", () => {
    const claudePart = JSON.stringify({ hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: "cache entry" } });
    const clinePart = JSON.stringify({ contextModification: "PRD slice" });
    const merged = JSON.parse(joinContextResponses(claudePart, clinePart)) as { contextModification?: string; hookSpecificOutput?: unknown };
    expect(merged.hookSpecificOutput).toBeUndefined();
    expect(merged.contextModification).toBe("cache entry\n\nPRD slice");
  });
});
