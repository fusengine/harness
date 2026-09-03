/**
 * @module test/sim/prd-regression
 * Non-regression matrix (prd-design.md §4): every EXISTING scenario under
 * `test/sim/scenarios/*.json` (excluding the new PRD-specific corpus, see
 * {@link discoverBaselineScenarios}) is replayed three times per scenario —
 * `{}` (flag absent), `{FUSE_PRD:"1"}` with no router on disk, and
 * `{FUSE_PRD:"1"}` WITH the PRD fixtures materialized under
 * `$TMP/<homeSeg>/apex/` — asserting `{stdout, exit}` are identical across
 * all three AFTER {@link normalizeRow} erases each row's own fresh `$TMP`
 * and any Codex CONFIRM display code (the only two legitimate per-row
 * differences — see `prd-regression-helpers.ts`'s doc comment). The PRD
 * module (`src/runtime/prd/**`, `src/policy/prd/**`) is live: this suite is
 * the load-bearing "inert unless FUSE_PRD=1 AND a router is on disk" proof,
 * backed by a positive witness (below) showing activation genuinely changes
 * behavior — a suite that never activates its own target proves nothing.
 * Each of the 3 rows gets its OWN fresh `mkdtemp` tmp dir AND `HOME` (never
 * shared, never reused): sharing one tmp/HOME across rows was tried first and
 * reverted — it caused an intermittent cross-row flake under full-suite load
 * (measured: scenario 13 failed once in an 81s full-suite run, passed 2/2 in
 * isolation), most likely a wall-clock-adjacent dedup/throttle window
 * (`inject-dedup`, lessons throttle) not fully reset by a directory wipe.
 */
import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { substitute } from "./load";
import { runHook, spawnEnv } from "./exec";
import { materializePrdFixtures } from "../helpers/prd-env";
import { harnessHomeSegment } from "../../src/policy/apex-target";
import { FIXTURES, materializeSetupFiles, normalizeRow, replayFresh, type RowStep } from "./prd-regression-helpers";
import type { SetupFile } from "./types";

const SCENARIOS_DIR = join(import.meta.dir, "scenarios");

/**
 * Every baseline scenario, excluding the new PRD-specific corpus
 * (30-prd-ownership-deny-claude, 30b-prd-ownership-deny-codex,
 * 30c-prd-ownership-advisory-cursor, 31-prd-subagentstop-block-once-claude).
 * Matched on the literal `-prd-` infix, NOT a numeric "30"/"31" prefix: two
 * UNRELATED pre-existing scenarios already occupy those numbers
 * (30-codex-config-toml-protected.json, 31-codex-array-command-bypass-
 * permissions-allow.json) — a prefix-based filter would silently drop them
 * from this non-regression matrix too.
 */
function discoverBaselineScenarios(): string[] {
  return [...new Glob("*.json").scanSync({ cwd: SCENARIOS_DIR, absolute: true })]
    .filter((p) => !/-prd-/.test(basename(p)))
    .sort();
}

const baseline = discoverBaselineScenarios();

test("baseline corpus is non-empty (guards against a silently-empty regression run)", () => {
  expect(baseline.length).toBeGreaterThan(0);
});

test("materializeSetupFiles rejects a setup path escaping $TMP", () => {
  const tmp = mkdtempSync(join(tmpdir(), "fh-prdreg-guard-"));
  try {
    const escapee: SetupFile = { path: join(tmpdir(), "fh-prdreg-guard-escape.json"), content: "{}" };
    expect(() => materializeSetupFiles([escapee], tmp, {})).toThrow(/setup path escapes \$TMP/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// Generous per-scenario budget: 3 full replays of a scenario that may itself
// contain a burst-dedup delayMs sleep (scenarios 03/16, ~2.1s each) — mirrors
// simulator.test.ts's own SCENARIO_TIMEOUT_MS rationale, tripled for 3 rows.
const ROW_TIMEOUT_MS = 90_000;

describe("PRD flag/router non-regression ({stdout, exit} identical off/on-no-router/on-with-router, normalized)", () => {
  for (const path of baseline) {
    const name = basename(path, ".json");
    test(name, async () => {
      const off: RowStep[] = normalizeRow(await replayFresh(path, {}, false));
      const onNoRouter: RowStep[] = normalizeRow(await replayFresh(path, { FUSE_PRD: "1" }, false));
      const onWithRouter: RowStep[] = normalizeRow(await replayFresh(path, { FUSE_PRD: "1" }, true));
      expect(onNoRouter).toEqual(off);
      expect(onWithRouter).toEqual(off);
    }, ROW_TIMEOUT_MS);
  }
});

/**
 * Positive witness (mandatory companion to the invariance matrix above): a
 * suite that only ever proves "nothing changes" while FUSE_PRD is never
 * actually exercised proves nothing about the module's ON path. This runs
 * ONE PreToolUse event — a sub-agent (`backend-expert`) writing ANOTHER
 * agent's own PRD report file, the exact shape `prd-pre-gate.ts` resolves
 * ownership from (test/fixtures/prd/README.md §1's worked example) — under
 * the same off/on-no-router/on-with-router rows, and asserts ONLY that the
 * activated row's output genuinely DIFFERS from the inert rows. It never
 * pins any literal text a PRD guard emits (title, reason wording, prompt
 * shape): those guards are actively being revised in parallel lots of this
 * same PR, so asserting their exact string here would make this witness
 * fail on a wording change that is not a regression. Output equality (not
 * inequality) still needs `$TMP` erased first (see {@link normalizeRow}'s
 * doc comment) — this event's own `tool_input.file_path` embeds the row's
 * tmp dir verbatim, so an un-normalized off/onNoRouter compare would flake.
 */
test("FUSE_PRD=1 + router changes PreToolUse output (positive witness — activation is not a no-op)", async () => {
  const event = {
    hook_event_name: "PreToolUse",
    session_id: "sc-witness",
    agent_id: "agent-backend-expert-0001",
    agent_type: "backend-expert",
    tool_name: "Write",
    tool_input: {
      file_path: "$TMP/.claude/apex/prd/agents/backend-expert-2-prd.json",
      content: "{}",
    },
  };
  const runOnce = async (envOverlay: Record<string, string>, seedPrd: boolean): Promise<string> => {
    const tmp = mkdtempSync(join(tmpdir(), "fh-prdreg-witness-"));
    try {
      const vars = { TMP: tmp, FIXTURES };
      const env = spawnEnv(FIXTURES, tmp, substitute(envOverlay, vars));
      if (seedPrd) materializePrdFixtures(tmp, harnessHomeSegment("claude-code"));
      const stdout = runHook("claude-code", "core", substitute(event, vars), tmp, env).stdout;
      return stdout.split(tmp).join("$TMP");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  };
  const off = await runOnce({}, false);
  const onNoRouter = await runOnce({ FUSE_PRD: "1" }, false);
  const onWithRouter = await runOnce({ FUSE_PRD: "1" }, true);
  // Flag alone (router absent) must stay inert — isPrdEnabled requires both.
  expect(onNoRouter).toBe(off);
  // Router present: the load-bearing proof that activation genuinely changes something.
  expect(onWithRouter).not.toBe(off);
}, ROW_TIMEOUT_MS);
