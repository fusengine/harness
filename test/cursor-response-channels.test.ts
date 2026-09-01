import { expect, test } from "bun:test";
import { toCursorLifecycleResponse, toCursorResponse } from "../src/adapters/cursor/respond";

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
