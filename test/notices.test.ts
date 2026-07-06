import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import {
  complianceNotice,
  requirementNotice,
  skillNameFromRefPath,
  refCreditedNotice,
  evidenceFreshNotice,
  sniperRequiredNotice,
  refCreditNoticeFor,
} from "../src/runtime/notices";
import { respond } from "../src/runtime/respond";

const tmp = (): string => mkdtempSync(join(tmpdir(), "fh-notices-"));

test("complianceNotice/requirementNotice: uniform 1-line format", () => {
  expect(complianceNotice("gate", "detail")).toBe("✓ gate — detail");
  expect(complianceNotice("gate", "")).toBe("✓ gate");
  expect(requirementNotice("req", "detail")).toBe("⚠ req — detail");
  expect(requirementNotice("req", "")).toBe("⚠ req");
});

test("skillNameFromRefPath/refCreditedNotice: extracts the skill, null for a banal .md", () => {
  expect(skillNameFromRefPath("/plugins/react-expert/skills/solid-react/SKILL.md")).toBe("solid-react");
  expect(skillNameFromRefPath("/project/README.md")).toBeNull();
  expect(refCreditedNotice("/plugins/react-expert/skills/solid-react/SKILL.md")).toBe("✓ SOLID refs read — solid-react");
  expect(refCreditedNotice("/project/README.md")).toBeNull();
});

test("evidenceFreshNotice/sniperRequiredNotice: fixed wording", () => {
  expect(evidenceFreshNotice()).toBe("✓ evidence fresh — explore+research");
  expect(sniperRequiredNotice("a.ts")).toBe("⚠ sniper required — a.ts");
});

test("refCreditNoticeFor: fires once for a skill-ref Read, deduped within the burst window, ignores non-ref/non-skill activities", () => {
  const dir = tmp();
  const activities = [
    { kind: "agent" },
    { kind: "ref", path: "/plugins/react-expert/skills/solid-react/SKILL.md" },
  ];
  const first = refCreditNoticeFor(activities, "s1", 1000, dir);
  expect(first).toBe("✓ SOLID refs read — solid-react");
  // Same (session, path) inside the burst window (the ~11 sibling-plugin fan-out for one
  // real Read) → suppressed, never repeated.
  const second = refCreditNoticeFor(activities, "s1", 1500, dir);
  expect(second).toBeNull();
  // A banal (non-skill) .md ref never produces a notice at all.
  expect(refCreditNoticeFor([{ kind: "ref", path: "/project/README.md" }], "s1", 1000, dir)).toBeNull();
  // No ref activity at all → null.
  expect(refCreditNoticeFor([{ kind: "agent" }], "s1", 1000, dir)).toBeNull();
});

test("no-op without a systemMessage channel: cline drops a pure notice silently instead of crashing", () => {
  const notice = sniperRequiredNotice("a.ts");
  const prompt = { kind: "inform", title: "x", reason: "", userMessage: notice } as const;
  expect(respond("cline", prompt)).toBe("");
  // claude-code/gemini-cli DO have the channel: the same prompt surfaces there.
  expect(JSON.parse(respond("claude-code", prompt)).systemMessage).toBe(notice);
  expect(JSON.parse(respond("gemini-cli", prompt)).systemMessage).toBe(notice);
});
