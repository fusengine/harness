/**
 * Differential proof (real processes): the rendezvous (concurrent, ON) leaves
 * every process with byte-identical stdout/stderr/exit and the sandbox with the
 * same state as the same scopes run separately (OFF) in the leader's order.
 * Scope sets come from the real Codex/Claude declarations (see multi-routes.ts).
 */
import { describe, expect, test } from "bun:test";
import { claudeScopesFor, codexScopesFor } from "./multi-routes";
import { put, runCase, type Case, type Step } from "./multi-differential";
import type { Sandbox } from "./multi-spawn";

const project = (sb: Sandbox): void => {
  put(sb, "package.json", '{"name":"p","type":"module"}');
  put(sb, "src/a.ts", "export const a = 1;\n");
};

/** Codex-shaped payload factory. */
const codex = (event: string, extra: Record<string, unknown>) => (sb: Sandbox): Record<string, unknown> => ({
  hook_event_name: event, session_id: "sess-1", turn_id: "turn-1", cwd: sb.cwd, model: "gpt", permission_mode: "default", transcript_path: null, ...extra,
});

/** Build a Codex step whose scope list follows the real declarations. */
function codexStep(event: string, extra: Record<string, unknown>): Step {
  const payloadFor = codex(event, extra);
  return { payloadFor, scopes: codexScopesFor(payloadFor({ home: "", cwd: "/x" })) };
}

async function expectEqual(c: Case): Promise<void> {
  const { steps, stateDiffs } = await runCase(c);
  for (const s of steps) {
    expect(s.outputDiffs).toEqual([]);
    expect(s.order.length).toBe(s.scopes.length);
  }
  expect(stateDiffs).toEqual([]);
}

describe("rendezvous == N separate processes (Codex)", () => {
  test("PostToolUse Bash", async () => {
    const step = codexStep("PostToolUse", { tool_name: "Bash", tool_use_id: "u1", tool_input: { command: "ls" }, tool_response: "ok" });
    expect(step.scopes.length).toBeGreaterThan(10);
    await expectEqual({ host: "codex", setup: project, steps: [step] });
  }, 120_000);
});

describe("scope selection mirrors the real declarations", () => {
  test("Claude PreToolUse Write", () => {
    expect(claudeScopesFor({ hook_event_name: "PreToolUse", tool_name: "Write" }).length).toBeGreaterThan(2);
  });
});
