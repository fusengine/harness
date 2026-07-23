import { test, expect } from "bun:test";
import { renderInform } from "../src/runtime/inform";
import { attachSystemMessage, contextResponse } from "../src/adapters/claude";

test("renderInform: claude-code/codex stay byte-identical to the historical builders", () => {
  const expected = attachSystemMessage(contextResponse("UserPromptSubmit", "BODY"), "note");
  expect(renderInform("claude-code", "UserPromptSubmit", "BODY", "note")).toBe(expected);
  expect(renderInform("codex", "UserPromptSubmit", "BODY", "note")).toBe(expected);
  expect(renderInform("gemini-cli", "UserPromptSubmit", "BODY")).toBe(contextResponse("UserPromptSubmit", "BODY"));
});

test("renderInform: kimi gets raw text (no JSON envelope), notice appended as text", () => {
  expect(renderInform("kimi", "UserPromptSubmit", "BODY")).toBe("BODY");
  expect(renderInform("kimi", "UserPromptSubmit", "BODY", "note")).toBe("BODY\n\nnote");
  expect(renderInform("kimi", "UserPromptSubmit", "BODY", "note")).not.toContain("hookSpecificOutput");
});
