import { describe, expect, test } from "bun:test";
import { prdPostCheck } from "../../../src/runtime/prd/prd-post-check";
import { normalizeEvent } from "../../../src/runtime/normalize";
import { loadTrack } from "../../../src/tracking/store";
import { prdTaskPath } from "../../../src/policy/prd";
import { seedCrossCheckViolation, setupPrdEnv } from "./env";

const NOW = 1_700_000_000_000;

function taskWriteEvent(sessionId: string, absPath: string) {
  return normalizeEvent("claude-code", { hook_event_name: "PostToolUse", tool_name: "Write", session_id: sessionId, tool_input: { file_path: absPath, content: "{}" } });
}

describe("B2 — PostToolUse cross-check", () => {
  test("a validated sub-task without a matching done report is journaled once; a replay never duplicates it", async () => {
    const env = setupPrdEnv();
    try {
      process.env.FUSE_PRD = "1";
      seedCrossCheckViolation(env.root, env.homeSeg);
      const target = prdTaskPath(env.root, env.homeSeg, "prd/auth-refactor-prd.json");
      const event = taskWriteEvent(env.sessionId, target);

      await prdPostCheck("claude-code", event, env.root, env.trackFilePath, NOW);
      const first = await loadTrack(env.trackFilePath);
      // backend-expert's report already has jwt-validation "done" (fixture) — no violation there;
      // backend-expert-2 has no report at all — exactly one violation.
      expect(first.prdViolations).toEqual([{ ts: NOW, task: "auth-refactor", agent: "backend-expert-2", sub: "session-store", reason: "validated without a matching done report" }]);

      await prdPostCheck("claude-code", event, env.root, env.trackFilePath, NOW + 1000); // replay
      const second = await loadTrack(env.trackFilePath);
      expect(second.prdViolations?.length).toBe(1); // deduped, not doubled
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });

  test("returns void — never stdout — and is inert when the flag is absent", async () => {
    const env = setupPrdEnv();
    try {
      delete process.env.FUSE_PRD;
      seedCrossCheckViolation(env.root, env.homeSeg);
      const target = prdTaskPath(env.root, env.homeSeg, "prd/auth-refactor-prd.json");
      const result = await prdPostCheck("claude-code", taskWriteEvent(env.sessionId, target), env.root, env.trackFilePath, NOW);
      expect(result).toBeUndefined();
      const track = await loadTrack(env.trackFilePath);
      expect(track.prdViolations ?? []).toEqual([]); // inert: no journal write at all
    } finally {
      env.restore();
    }
  });

  test("a write outside task/router paths (e.g. an agent's own report) never triggers the cross-check", async () => {
    const env = setupPrdEnv();
    try {
      process.env.FUSE_PRD = "1";
      seedCrossCheckViolation(env.root, env.homeSeg);
      const agentReport = `${env.root}/${env.homeSeg}/apex/prd/agents/backend-expert-prd.json`;
      await prdPostCheck("claude-code", taskWriteEvent(env.sessionId, agentReport), env.root, env.trackFilePath, NOW);
      const track = await loadTrack(env.trackFilePath);
      expect(track.prdViolations ?? []).toEqual([]);
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });
});
