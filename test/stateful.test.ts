import { test, expect } from "bun:test";
import { emptyTrack, recordAgent, agentsFresh, recordTrivialEdit, trivialCount, recordBrainstormRequired } from "../src/tracking/session-state";
import { detectCreationIntent } from "../src/policy/creation-intent";
import { brainstormGate } from "../src/policy/apex";

test("agentsFresh ignores insufficient-quality agents", () => {
  let t = recordAgent(emptyTrack(), "research-expert", 1000, "insufficient");
  expect(agentsFresh(t, ["research-expert"], 5000, 2000)).toBe(false);
  t = recordAgent(t, "research-expert", 1500, "sufficient");
  expect(agentsFresh(t, ["research-expert"], 5000, 2000)).toBe(true);
});

test("trivial-edit sliding window count", () => {
  let t = emptyTrack();
  t = recordTrivialEdit(t, 1000, 5000, 1000);
  t = recordTrivialEdit(t, 2000, 5000, 2000);
  expect(trivialCount(t, 5000, 3000)).toBe(2);
  expect(trivialCount(t, 500, 10000)).toBe(0);
});

test("detectCreationIntent: create yes, fix no", () => {
  expect(detectCreationIntent("create a new dashboard component")).toBe(true);
  expect(detectCreationIntent("fix the login bug")).toBe(false);
  expect(detectCreationIntent("refactor and add a helper")).toBe(false);
});

test("brainstormGate blocks when required + not fresh", () => {
  const base = { sessionId: "s", framework: "react", filePath: "a.tsx", content: "" };
  expect(brainstormGate({ ...base, brainstormRequired: true, brainstormFresh: false })?.title).toContain("brainstorm");
  expect(brainstormGate({ ...base, brainstormRequired: true, brainstormFresh: true })).toBeNull();
  expect(brainstormGate({ ...base, brainstormRequired: false, brainstormFresh: false })).toBeNull();
});

test("recordBrainstormRequired sets the flag", () => {
  expect(recordBrainstormRequired(emptyTrack(), true).brainstormRequired).toBe(true);
});
