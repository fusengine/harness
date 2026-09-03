import { describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { prdStopGate } from "../../../src/runtime/prd/prd-stop-gate";
import { prdPostCheck } from "../../../src/runtime/prd/prd-post-check";
import { normalizeEvent } from "../../../src/runtime/normalize";
import { prdRouterPath, prdTaskPath } from "../../../src/policy/prd";
import { withTrack } from "../../../src/tracking/store";
import { recordPrdOwner } from "../../../src/tracking/session-state";
import { journalLogPath, readTrackSync } from "../../../src/tracking/track-compact";
import { seedCrossCheckViolation, setupPrdEnv } from "./env";

const NOW = 1_700_000_000_000;

/** Populates `track.prdViolations` the SAME way production does: run the real PostToolUse cross-check over a genuinely seeded violation. */
async function seedTrackViolation(id: string, root: string, homeSeg: string, sessionId: string, trackFilePath: string): Promise<void> {
  seedCrossCheckViolation(root, homeSeg);
  const target = prdTaskPath(root, homeSeg, "prd/auth-refactor-prd.json");
  const event = normalizeEvent(id, { hook_event_name: "PostToolUse", tool_name: "Write", session_id: sessionId, tool_input: { file_path: target, content: "{}" } });
  await prdPostCheck(id, event, root, trackFilePath, NOW);
}

describe("B5 — lead Stop block-once gate", () => {
  test("track.prdViolations non-empty (PostToolUse already found one): blocks once, a replay lets it pass", async () => {
    const env = setupPrdEnv();
    try {
      process.env.FUSE_PRD = "1";
      await seedTrackViolation("claude-code", env.root, env.homeSeg, env.sessionId, env.trackFilePath);
      const payload = { session_id: env.sessionId };
      const first = prdStopGate(payload, env.root, "claude-code", env.trackFilePath, NOW);
      expect(JSON.parse(first)).toMatchObject({ decision: "block" });

      const replay = prdStopGate(payload, env.root, "claude-code", env.trackFilePath, NOW + 1000);
      expect(replay).toBe("");
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });

  test("router entry marked validated whose task-PRD isn't actually fully validated: also blocks (the OTHER half of the design's OR)", () => {
    const env = setupPrdEnv();
    try {
      process.env.FUSE_PRD = "1";
      writeFileSync(prdRouterPath(env.root, env.homeSeg), JSON.stringify({ "auth-refactor": { prd: "prd/auth-refactor-prd.json", status: "validated" } }));
      const out = prdStopGate({ session_id: env.sessionId }, env.root, "claude-code", env.trackFilePath, NOW);
      expect(JSON.parse(out)).toMatchObject({ decision: "block" });
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });

  test("Codex (scope core routes Stop -> stopCore) gets the same block shape", async () => {
    const env = setupPrdEnv(".codex");
    try {
      process.env.FUSE_PRD = "1";
      await seedTrackViolation("codex", env.root, env.homeSeg, env.sessionId, env.trackFilePath);
      const out = prdStopGate({ session_id: env.sessionId }, env.root, "codex", env.trackFilePath, NOW);
      expect(JSON.parse(out)).toMatchObject({ decision: "block" });
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });

  test("Kimi gets its own Stop-blocking shape (Kimi's documented blocking event set includes Stop)", async () => {
    const env = setupPrdEnv(".kimi-code");
    try {
      process.env.FUSE_PRD = "1";
      await seedTrackViolation("kimi", env.root, env.homeSeg, env.sessionId, env.trackFilePath);
      const out = prdStopGate({ session_id: env.sessionId }, env.root, "kimi", env.trackFilePath, NOW);
      expect(JSON.parse(out)).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });

  test("Cursor's `stop` is a terminal observation event, never gated", async () => {
    const env = setupPrdEnv(".cursor");
    try {
      process.env.FUSE_PRD = "1";
      await seedTrackViolation("cursor", env.root, env.homeSeg, env.sessionId, env.trackFilePath);
      expect(prdStopGate({ session_id: env.sessionId }, env.root, "cursor", env.trackFilePath, NOW)).toBe("");
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });

  test("no violation: passes without a block", () => {
    const env = setupPrdEnv();
    try {
      process.env.FUSE_PRD = "1"; // fixture is un-mutated: sub-tasks are "assigned", never "validated"
      expect(prdStopGate({ session_id: env.sessionId }, env.root, "claude-code", env.trackFilePath, NOW)).toBe("");
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });

  test("flag absent: never blocked even with a real violation on disk", async () => {
    const env = setupPrdEnv();
    try {
      process.env.FUSE_PRD = "1";
      await seedTrackViolation("claude-code", env.root, env.homeSeg, env.sessionId, env.trackFilePath);
      delete process.env.FUSE_PRD;
      expect(prdStopGate({ session_id: env.sessionId }, env.root, "claude-code", env.trackFilePath, NOW)).toBe("");
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });
});

describe("B5 defect fix — block-once under FUSE_TRACK_JOURNAL=0 (legacy RMW)", () => {
  test("with the journal kill-switch off, the SAME unresolved violation still blocks the lead's Stop ONCE then falls silent on replay (was: block on every call)", () => {
    const env = setupPrdEnv();
    try {
      process.env.FUSE_PRD = "1";
      process.env.FUSE_TRACK_JOURNAL = "0";
      writeFileSync(prdRouterPath(env.root, env.homeSeg), JSON.stringify({ "auth-refactor": { prd: "prd/auth-refactor-prd.json", status: "validated" } }));
      const payload = { session_id: env.sessionId };
      const first = prdStopGate(payload, env.root, "claude-code", env.trackFilePath, NOW);
      expect(JSON.parse(first)).toMatchObject({ decision: "block" });
      expect(prdStopGate(payload, env.root, "claude-code", env.trackFilePath, NOW + 1000)).toBe("");
      expect(prdStopGate(payload, env.root, "claude-code", env.trackFilePath, NOW + 2000)).toBe("");
    } finally {
      delete process.env.FUSE_PRD;
      delete process.env.FUSE_TRACK_JOURNAL;
      env.restore();
    }
  });

  test("an OLD session (legacy snapshot on disk, its .log NEVER created) isn't crashed or double-blocked; pre-existing fields survive the marker write", async () => {
    const env = setupPrdEnv();
    try {
      process.env.FUSE_TRACK_JOURNAL = "0";
      await withTrack(env.trackFilePath, (t) => recordPrdOwner(t, "a1", "backend-expert-2"));
      expect(existsSync(journalLogPath(env.trackFilePath))).toBe(false); // genuinely no .log — the "old session" shape

      process.env.FUSE_PRD = "1";
      writeFileSync(prdRouterPath(env.root, env.homeSeg), JSON.stringify({ "auth-refactor": { prd: "prd/auth-refactor-prd.json", status: "validated" } }));
      const payload = { session_id: env.sessionId };
      expect(JSON.parse(prdStopGate(payload, env.root, "claude-code", env.trackFilePath, NOW))).toMatchObject({ decision: "block" });
      expect(existsSync(journalLogPath(env.trackFilePath))).toBe(false); // legacy branch writes the snapshot only
      expect(prdStopGate(payload, env.root, "claude-code", env.trackFilePath, NOW + 1000)).toBe("");
      expect(readTrackSync(env.trackFilePath, false).prdOwners).toMatchObject({ a1: "backend-expert-2" });
    } finally {
      delete process.env.FUSE_PRD;
      delete process.env.FUSE_TRACK_JOURNAL;
      env.restore();
    }
  });
});

describe("B5 defect fix — native block shape for gemini-cli/cline (was: Claude-shaped {decision:\"block\"} neither honors)", () => {
  test.each([
    ["gemini-cli", ".gemini", { decision: "deny" }],
    ["cline", ".clinerules", { cancel: true }],
  ] as const)("%s gets its native block shape, one-shot preserved", (id, homeSeg, shape) => {
    const env = setupPrdEnv(homeSeg);
    try {
      process.env.FUSE_PRD = "1";
      writeFileSync(prdRouterPath(env.root, env.homeSeg), JSON.stringify({ "auth-refactor": { prd: "prd/auth-refactor-prd.json", status: "validated" } }));
      const payload = { session_id: env.sessionId };
      const first = prdStopGate(payload, env.root, id, env.trackFilePath, NOW);
      expect(JSON.parse(first)).toMatchObject(shape);
      expect(prdStopGate(payload, env.root, id, env.trackFilePath, NOW + 1000)).toBe("");
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });
});

describe("B5 non-regression — byte-identical output for the 5 protected targets (pinned, captured BEFORE the respond() routing fix)", () => {
  const PINNED = "{\"decision\":\"block\",\"reason\":\"PRD cross-check found unresolved violation(s): a task/sub-task is marked validated without a matching done report. Run `harness prd status` for details.\"}";

  test.each([
    ["claude-code", ".claude"],
    ["codex", ".codex"],
    ["hermes", ".hermes"],
  ])("%s output stays byte-identical", (id, homeSeg) => {
    const env = setupPrdEnv(homeSeg);
    try {
      process.env.FUSE_PRD = "1";
      writeFileSync(prdRouterPath(env.root, env.homeSeg), JSON.stringify({ "auth-refactor": { prd: "prd/auth-refactor-prd.json", status: "validated" } }));
      const out = prdStopGate({ session_id: env.sessionId }, env.root, id, env.trackFilePath, NOW);
      expect(out).toBe(PINNED);
    } finally {
      delete process.env.FUSE_PRD;
      env.restore();
    }
  });
});
