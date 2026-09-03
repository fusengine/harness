import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { prdSubagentStopGate } from "../../../src/runtime/prd/prd-subagent-stop";
import { withTrack } from "../../../src/tracking/store";
import { recordPrdOwner } from "../../../src/tracking/session-state";
import { journalLogPath, readTrackSync } from "../../../src/tracking/track-compact";
import { setupPrdEnv } from "./env";

const NOW = 1_700_000_000_000;

describe("B4 — SubagentStop block-once gate", () => {
  test("incomplete sub-task (backend-expert-2's session-store, no report at all) blocks once; a replay is \"\" (silent, but still non-null so the caller skips trackAgentMemory)", () => {
    const env = setupPrdEnv();
    try {
      process.env.FUSE_PRD = "1";
      const payload = { session_id: env.sessionId, agent_type: "backend-expert-2" };
      const first = prdSubagentStopGate(payload, env.root, "claude-code", env.trackFilePath, NOW);
      expect(first).not.toBeNull();
      expect(JSON.parse(first!)).toMatchObject({ decision: "block" });
      expect(first).toContain("session-store");

      const replay = prdSubagentStopGate(payload, env.root, "claude-code", env.trackFilePath, NOW + 1000);
      expect(replay).toBe(""); // non-null (caller must NOT fall through to trackAgentMemory), but silent
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });

  test("a fully-done agent (backend-expert, jwt-validation already done) is never blocked — null (genuinely done, caller falls through to trackAgentMemory normally), bound via agent_id so its SAME-type sibling's incomplete work is never blamed on it", async () => {
    const env = setupPrdEnv();
    try {
      process.env.FUSE_PRD = "1";
      // Without this bind, agent_type "backend-expert" alone would ambiguously
      // match BOTH siblings (matchesAgentName's "-n" rule) and find the
      // OTHER one's incomplete "session-store" — resolveCandidates narrows to
      // the bound name specifically, the fix this test exists to prove.
      await withTrack(env.trackFilePath, (t) => recordPrdOwner(t, "a1", "backend-expert"));
      const out = prdSubagentStopGate({ session_id: env.sessionId, agent_id: "a1", agent_type: "backend-expert" }, env.root, "claude-code", env.trackFilePath, NOW);
      expect(out).toBeNull();
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });

  test("an unnamed agent is never blocked (null)", () => {
    const env = setupPrdEnv();
    try {
      process.env.FUSE_PRD = "1";
      expect(prdSubagentStopGate({ session_id: env.sessionId }, env.root, "claude-code", env.trackFilePath, NOW)).toBeNull();
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });

  test("Cursor never gets a block, even with a genuinely incomplete sub-task (null)", () => {
    const env = setupPrdEnv(".cursor"); // cursor's homeSeg — so the module is genuinely ENABLED, not skipped by accident
    try {
      process.env.FUSE_PRD = "1";
      const out = prdSubagentStopGate({ session_id: env.sessionId, subagent_type: "backend-expert-2" }, env.root, "cursor", env.trackFilePath, NOW);
      expect(out).toBeNull();
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });

  test("Kimi gets the observation-only Kimi-shaped deny envelope (best-effort per adapters.md), still one-shot", () => {
    const env = setupPrdEnv(".kimi-code"); // kimi's homeSeg — must match harnessHomeSegment("kimi")
    try {
      process.env.FUSE_PRD = "1";
      const first = prdSubagentStopGate({ session_id: env.sessionId, agent_type: "backend-expert-2" }, env.root, "kimi", env.trackFilePath, NOW);
      expect(JSON.parse(first!)).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
      const replay = prdSubagentStopGate({ session_id: env.sessionId, agent_type: "backend-expert-2" }, env.root, "kimi", env.trackFilePath, NOW + 1000);
      expect(replay).toBe("");
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });

  test("flag absent: never blocked (null)", () => {
    const env = setupPrdEnv();
    try {
      delete process.env.FUSE_PRD;
      expect(prdSubagentStopGate({ session_id: env.sessionId, agent_type: "backend-expert-2" }, env.root, "claude-code", env.trackFilePath, NOW)).toBeNull();
    } finally {
      env.restore();
    }
  });
});

describe("B4 defect fix — block-once under FUSE_TRACK_JOURNAL=0 (legacy RMW)", () => {
  test("with the journal kill-switch off, the SAME incomplete sub-task still blocks ONCE then falls silent on replay (was: block on every call — the one-shot marker was journal-only, never seen by the legacy snapshot-only read)", () => {
    const env = setupPrdEnv();
    try {
      process.env.FUSE_PRD = "1";
      process.env.FUSE_TRACK_JOURNAL = "0";
      const payload = { session_id: env.sessionId, agent_type: "backend-expert-2" };
      const first = prdSubagentStopGate(payload, env.root, "claude-code", env.trackFilePath, NOW);
      expect(first).not.toBeNull();
      expect(JSON.parse(first!)).toMatchObject({ decision: "block" });

      const replay = prdSubagentStopGate(payload, env.root, "claude-code", env.trackFilePath, NOW + 1000);
      expect(replay).toBe("");

      const thirdCall = prdSubagentStopGate(payload, env.root, "claude-code", env.trackFilePath, NOW + 2000);
      expect(thirdCall).toBe("");
    } finally {
      delete process.env.FUSE_PRD;
      delete process.env.FUSE_TRACK_JOURNAL;
      env.restore();
    }
  });

  test("an OLD session (legacy snapshot already on disk, its .log NEVER created) is not crashed nor double-blocked by the fix — the legacy branch never touches .log, and pre-existing track fields survive the marker write untouched", async () => {
    const env = setupPrdEnv();
    try {
      process.env.FUSE_TRACK_JOURNAL = "0";
      await withTrack(env.trackFilePath, (t) => recordPrdOwner(t, "a1", "backend-expert-2"));
      expect(existsSync(journalLogPath(env.trackFilePath))).toBe(false); // genuinely no .log — the "old session" shape

      process.env.FUSE_PRD = "1";
      const payload = { session_id: env.sessionId, agent_type: "backend-expert-2" };
      const first = prdSubagentStopGate(payload, env.root, "claude-code", env.trackFilePath, NOW);
      expect(JSON.parse(first!)).toMatchObject({ decision: "block" });
      expect(existsSync(journalLogPath(env.trackFilePath))).toBe(false); // legacy branch writes the snapshot only

      const replay = prdSubagentStopGate(payload, env.root, "claude-code", env.trackFilePath, NOW + 1000);
      expect(replay).toBe("");

      const after = readTrackSync(env.trackFilePath, false);
      expect(after.prdOwners).toMatchObject({ a1: "backend-expert-2" }); // pre-existing field survived the RMW
    } finally {
      delete process.env.FUSE_PRD;
      delete process.env.FUSE_TRACK_JOURNAL;
      env.restore();
    }
  });
});

describe("B4 defect fix — native block shape for gemini-cli/cline (was: Claude-shaped {decision:\"block\"} neither honors)", () => {
  test("gemini-cli gets its native deny shape ({decision:\"deny\",reason}), one-shot preserved", () => {
    const env = setupPrdEnv(".gemini");
    try {
      process.env.FUSE_PRD = "1";
      const payload = { session_id: env.sessionId, agent_type: "backend-expert-2" };
      const first = prdSubagentStopGate(payload, env.root, "gemini-cli", env.trackFilePath, NOW);
      expect(JSON.parse(first!)).toMatchObject({ decision: "deny" });
      expect(first).toContain("session-store");
      const replay = prdSubagentStopGate(payload, env.root, "gemini-cli", env.trackFilePath, NOW + 1000);
      expect(replay).toBe("");
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });

  test("cline gets its native cancel shape ({cancel:true,errorMessage}), one-shot preserved", () => {
    const env = setupPrdEnv(".clinerules");
    try {
      process.env.FUSE_PRD = "1";
      const payload = { session_id: env.sessionId, agent_type: "backend-expert-2" };
      const first = prdSubagentStopGate(payload, env.root, "cline", env.trackFilePath, NOW);
      expect(JSON.parse(first!)).toMatchObject({ cancel: true });
      expect(first).toContain("session-store");
      const replay = prdSubagentStopGate(payload, env.root, "cline", env.trackFilePath, NOW + 1000);
      expect(replay).toBe("");
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });
});

describe("B4 non-regression — byte-identical output for the 5 protected targets (pinned, captured BEFORE the respond() routing fix)", () => {
  const PINNED = "{\"decision\":\"block\",\"reason\":\"PRD sub-task(s) not done for backend-expert-2 on task \\\"auth-refactor\\\": session-store. Finish the work (or ask the coordinator to reassign) before stopping.\"}";

  test.each([
    ["claude-code", ".claude"],
    ["codex", ".codex"],
    ["hermes", ".hermes"],
  ])("%s output stays byte-identical", (id, homeSeg) => {
    const env = setupPrdEnv(homeSeg);
    try {
      process.env.FUSE_PRD = "1";
      const out = prdSubagentStopGate({ session_id: env.sessionId, agent_type: "backend-expert-2" }, env.root, id, env.trackFilePath, NOW);
      expect(out).toBe(PINNED);
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });
});
