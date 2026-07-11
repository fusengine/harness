import { test, expect } from "bun:test";
import { activityFor } from "../src/runtime/activity";

test("activityFor: a Bash cat of a .md ref is credited as a ref activity", () => {
  const activities = activityFor({
    tool: "Bash",
    input: { command: "cat skills/security-scan/references/scan-patterns.md" },
    sessionId: "s1",
    framework: "generic",
    now: 1000,
  });
  expect(activities).toContainEqual({ kind: "ref", path: "skills/security-scan/references/scan-patterns.md", ts: 1000 });
});

test("activityFor: a Bash argv-array bash -c cat is credited too (Codex form)", () => {
  const activities = activityFor({
    tool: "Bash",
    input: { command: ["bash", "-lc", "cat skills/react/references/hooks.md"] },
    sessionId: "s1",
    framework: "generic",
    now: 2000,
  });
  expect(activities).toContainEqual({ kind: "ref", path: "skills/react/references/hooks.md", ts: 2000 });
});

test("activityFor: a non-read Bash command credits no ref activity", () => {
  const activities = activityFor({
    tool: "Bash",
    input: { command: "echo hi" },
    sessionId: "s1",
    framework: "generic",
    now: 3000,
  });
  expect(activities.some((a) => a.kind === "ref")).toBe(false);
});

test("activityFor: a native Read of a .md ref is UNAFFECTED by the new Bash branch", () => {
  const activities = activityFor({
    tool: "Read",
    input: { file_path: "skills/solid/references/srp.md" },
    sessionId: "s1",
    framework: "generic",
    now: 4000,
  });
  expect(activities).toEqual([{ kind: "ref", path: "skills/solid/references/srp.md", ts: 4000 }]);
});
