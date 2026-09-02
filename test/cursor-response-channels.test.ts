import { expect, test } from "bun:test";
import { toCursorLifecycleResponse, toCursorResponse } from "../src/adapters/cursor/respond";

const TRUNCATION_MARKER = "\n[fuse-harness] additional_context truncated to Cursor's 10000-char limit";

/** Minimal valid native passthrough for one event, carrying a given `additional_context` length. */
function nativeWithContext(eventName: string, length: number): string {
  const additional_context = "x".repeat(length);
  const byEvent: Record<string, Record<string, unknown>> = {
    sessionStart: { additional_context },
    beforeSubmitPrompt: { continue: true, additional_context },
    preToolUse: { permission: "allow", additional_context },
    postToolUse: { additional_context },
    postToolUseFailure: { additional_context },
  };
  return JSON.stringify(byEvent[eventName]);
}

test("Cursor additional_context truncates to Cursor's 10000-char carrier limit on every affected event", () => {
  for (const eventName of ["sessionStart", "beforeSubmitPrompt", "preToolUse", "postToolUse", "postToolUseFailure"]) {
    const oversized = nativeWithContext(eventName, 12_000);
    const truncated = JSON.parse(toCursorLifecycleResponse(oversized, eventName)) as { additional_context: string };
    expect(truncated.additional_context.length, eventName).toBeLessThanOrEqual(10_000);
    expect(truncated.additional_context.endsWith(TRUNCATION_MARKER), eventName).toBe(true);

    const under = nativeWithContext(eventName, 9_000);
    expect(toCursorLifecycleResponse(under, eventName), eventName).toBe(under);

    const exact = nativeWithContext(eventName, 10_000);
    expect(toCursorLifecycleResponse(exact, eventName), eventName).toBe(exact);
  }
});

test("Cursor direct response additional_context also truncates at Cursor's 10000-char limit", () => {
  const reason = "x".repeat(12_000 - 8);
  const rendered = toCursorResponse({ kind: "inform", title: "", reason }, "sessionStart");
  const { additional_context } = JSON.parse(rendered) as { additional_context: string };
  expect(additional_context.length).toBeLessThanOrEqual(10_000);
  expect(additional_context.endsWith(TRUNCATION_MARKER)).toBe(true);
});

test("Cursor direct inform preserves distinct user and agent channels", () => {
  expect(toCursorResponse({
    kind: "inform",
    title: "Design review",
    reason: "agent guidance",
    userMessage: "human notice",
  }, "preToolUse")).toBe(
    '{"permission":"allow","user_message":"human notice","agent_message":"[NOTE] Design review\\nagent guidance"}',
  );
});

test("Cursor lifecycle allow preserves user-only, agent-only, and mixed channels", () => {
  expect(toCursorLifecycleResponse('{"systemMessage":"human notice"}', "preToolUse")).toBe(
    '{"permission":"allow","user_message":"human notice"}',
  );
  expect(toCursorLifecycleResponse(
    '{"hookSpecificOutput":{"additionalContext":"agent guidance"}}',
    "preToolUse",
  )).toBe('{"permission":"allow","agent_message":"agent guidance"}');
  expect(toCursorLifecycleResponse(
    '{"systemMessage":"human notice","hookSpecificOutput":{"additionalContext":"agent guidance"}}',
    "preToolUse",
  )).toBe('{"permission":"allow","user_message":"human notice","agent_message":"agent guidance"}');
});
