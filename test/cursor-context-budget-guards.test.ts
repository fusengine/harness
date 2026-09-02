/**
 * Split out of `cursor-context-budget.test.ts` (SOLID 200-line ceiling — see
 * `FUSE_SOLID_MAX_LINES`): the challenger-reported F2/F3/F4 guards on the
 * Cursor `additional_context` shared-budget registry.
 * - F2: a degenerate key (no session_id/conversation_id) must skip the
 *   registry entirely instead of sharing one bucket across sessions.
 * - F3: `tool_use_id` must join the registry key so Cursor's per-tool-call
 *   merge semantics on preToolUse/postToolUse/postToolUseFailure are honored.
 * - F4: an unbudgeted flat-cap pass followed by a budgeted re-cap of the SAME
 *   stdout (lifecycle-bridge.ts/handle-scope-async.ts, then handle.ts) must
 *   never carry more than one {@link TRUNCATION_MARKER}.
 */
import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toCursorLifecycleResponse } from "../src/adapters/cursor/respond";
import { TRUNCATION_MARKER } from "../src/adapters/cursor/context-limit";
import { handleHook } from "../src/runtime/handle";
import { isolatedStateDir } from "./cursor-context-budget.test";

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}
function preToolUseWith(length: number): string {
  return JSON.stringify({ permission: "allow", additional_context: "x".repeat(length) });
}

test("F2: cursor sessionStart with no session_id/conversation_id never touches the shared registry (degenerate-key guard)", async () => {
  const cwd = tmp("cursor-budget-f2-");
  const stateDir = isolatedStateDir(cwd, cwd);
  try {
    const payload = { hook_event_name: "sessionStart" }; // no session_id, no conversation_id
    const first = await handleHook("cursor", payload, { now: Date.now(), cwd, scope: "core", home: cwd });
    const second = await handleHook("cursor", payload, { now: Date.now(), cwd, scope: "core", home: cwd });
    // No registry write at all (not even an empty file) — the flat cap alone
    // decided both responses, so two session-less calls never share a budget.
    expect(existsSync(join(stateDir, "cursor-context-budget.json"))).toBe(false);
    expect(second.stdout).toBe(first.stdout);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("F3: two preToolUse hooks, same session/generation, different tool_use_id — independent budgets, neither truncated", () => {
  const stateDir = tmp("cursor-budget-f3-");
  const base = { stateDir, sessionId: "s-f3", event: "preToolUse", generationId: "gen-1" };
  try {
    const outA = toCursorLifecycleResponse(preToolUseWith(7000), "preToolUse", { ...base, toolUseId: "call-a" });
    const outB = toCursorLifecycleResponse(preToolUseWith(7000), "preToolUse", { ...base, toolUseId: "call-b" });
    expect(outA).toBe(preToolUseWith(7000));
    expect(outB).toBe(preToolUseWith(7000));
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("F3: two preToolUse hooks with the SAME tool_use_id share one budget — the second truncates", () => {
  const stateDir = tmp("cursor-budget-f3b-");
  const budget = { stateDir, sessionId: "s-f3b", event: "preToolUse", generationId: "gen-1", toolUseId: "call-same" };
  try {
    toCursorLifecycleResponse(preToolUseWith(7000), "preToolUse", budget);
    const second = toCursorLifecycleResponse(preToolUseWith(7000), "preToolUse", budget);
    const { additional_context } = JSON.parse(second) as { additional_context: string };
    expect(additional_context.length).toBeLessThan(7000);
    expect(additional_context.endsWith(TRUNCATION_MARKER)).toBe(true);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("F4: an unbudgeted flat-cap pass followed by a budgeted re-cap of the same stdout carries exactly one marker", () => {
  const stateDir = tmp("cursor-budget-f4-");
  const now = Date.now();
  const key = "s-f4|sessionStart||";
  writeFileSync(join(stateDir, "cursor-context-budget.json"), JSON.stringify({ [key]: [{ at: now, length: 4000 }] }));
  try {
    const generic = JSON.stringify({ hookSpecificOutput: { additionalContext: "A".repeat(12_000) } });
    // Pass 1 mirrors lifecycle-bridge.ts/handle-scope-async.ts: unbudgeted, flat 10000 cap.
    const v1 = toCursorLifecycleResponse(generic, "sessionStart");
    // Pass 2 mirrors handle.ts's handleHook wrapper: budgeted re-cap of that same stdout.
    const v2 = toCursorLifecycleResponse(v1, "sessionStart", { stateDir, sessionId: "s-f4", event: "sessionStart", now });
    const { additional_context } = JSON.parse(v2) as { additional_context: string };
    expect(additional_context.split(TRUNCATION_MARKER).length - 1).toBe(1);
    expect(additional_context.length).toBeLessThanOrEqual(10_000 - 4000 - 9);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});
