import { expect, test } from "bun:test";
import * as nativeResponseModule from "../src/adapters/cursor/native-response";
import { parseNativeCursorStdout } from "../src/adapters/cursor/native-response";
import { toCursorLifecycleResponse } from "../src/adapters/cursor/respond";

const NATIVE_CASES = [
  ["sessionStart", '{"env":{"MODE":"safe"},"additional_context":"ctx","continue":true,"user_message":"note"}'],
  ["sessionEnd", "{}"],
  ["beforeSubmitPrompt", '{"continue":false,"user_message":"blocked"}'],
  ["preCompact", '{"user_message":"compacting"}'],
  ["subagentStart", '{"permission":"deny","user_message":"blocked"}'],
  ["subagentStop", '{"followup_message":"continue"}'],
  ["preToolUse", '{"permission":"ask","user_message":"ask user","agent_message":"ask agent","updated_input":{"command":"npm ci"}}'],
  ["postToolUse", '{"updated_mcp_tool_output":{"modified":"output"},"additional_context":"coverage"}'],
  ["postToolUseFailure", "{}"],
  ["beforeShellExecution", '{"permission":"ask","user_message":"ask user","agent_message":"ask agent"}'],
  ["afterShellExecution", "{}"],
  ["beforeMCPExecution", '{"permission":"ask","user_message":"ask user","agent_message":"ask agent"}'],
  ["afterMCPExecution", "{}"],
  ["beforeReadFile", '{"permission":"deny","user_message":"private"}'],
  ["afterFileEdit", "{}"],
  ["beforeTabFileRead", '{"permission":"deny"}'],
  ["afterTabFileEdit", "{}"],
  ["afterAgentResponse", "{}"],
  ["afterAgentThought", "{}"],
  ["stop", '{"followup_message":"iterate"}'],
  ["workspaceOpen", '{"pluginPaths":["/plugins/one","/plugins/two"]}'],
] as const;

test("native idempotence is recognized only from raw JSON stdout", () => {
  const stdout = ' {"permission":"allow","updated_input":{"command":"npm ci"}}\n';
  expect(parseNativeCursorStdout(stdout, "preToolUse")).toBe(stdout);
  expect(parseNativeCursorStdout('{"permission":"allow","unknown":true}', "preToolUse")).toBeNull();
  expect(parseNativeCursorStdout("not json", "preToolUse")).toBeNull();
});

test("native stdout parsing rejects non-strings without coercion", () => {
  const valid = '{"permission":"allow"}';
  let coercions = 0;
  const parseUnknown = parseNativeCursorStdout as (stdout: unknown, eventName: string) => string | null;
  const values: unknown[] = [
    { toString: () => { coercions += 1; return valid; } },
    new String(valid),
    { [Symbol.toPrimitive]: () => { coercions += 1; return valid; } },
    new Proxy({}, { get: () => { coercions += 1; return () => valid; } }),
  ];
  for (const value of values) expect(parseUnknown(value, "preToolUse")).toBeNull();
  expect(coercions).toBe(0);
});

test("all documented Cursor native response variants are byte-idempotent", () => {
  for (const [event, stdout] of NATIVE_CASES) {
    expect(toCursorLifecycleResponse(stdout, event), event).toBe(stdout);
  }
});

test("permission variants preserve only each event's supported message fields", () => {
  const cases = [
    ["preToolUse", ["allow", "deny", "ask"], { user_message: "u", agent_message: "a" }],
    ["beforeShellExecution", ["allow", "deny", "ask"], { user_message: "u", agent_message: "a" }],
    ["beforeMCPExecution", ["allow", "deny", "ask"], { user_message: "u", agent_message: "a" }],
    ["subagentStart", ["allow", "deny"], { user_message: "u" }],
    ["beforeReadFile", ["allow", "deny"], { user_message: "u" }],
    ["beforeTabFileRead", ["allow", "deny"], {}],
  ] as const;
  for (const [event, permissions, messages] of cases) {
    for (const permission of permissions) {
      const stdout = JSON.stringify({ permission, ...messages });
      expect(toCursorLifecycleResponse(stdout, event), `${event}:${permission}`).toBe(stdout);
    }
  }
});

test("Claude envelopes cannot masquerade as native Cursor responses", () => {
  const claude = '{"permission":"allow","hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason":"blocked"}}';
  const converted = toCursorLifecycleResponse(claude, "preToolUse");
  expect(converted).not.toBe(claude);
  expect(JSON.parse(converted)).toEqual({ permission: "deny", user_message: "blocked", agent_message: "blocked" });
});

test("neutral Cursor events preserve valid raw object bytes and normalize other output", () => {
  const neutral = [
    "sessionEnd", "postToolUseFailure", "afterShellExecution", "afterMCPExecution",
    "afterFileEdit", "afterTabFileEdit", "afterAgentResponse", "afterAgentThought",
  ];
  for (const event of neutral) {
    expect(toCursorLifecycleResponse(" { }\n", event), event).toBe(" { }\n");
    expect(toCursorLifecycleResponse('{"systemMessage":"claude"}', event), event).toBe("{}");
  }
});

test("native response module exposes no arbitrary-object recognition path", () => {
  expect(Object.keys(nativeResponseModule)).toEqual(["parseNativeCursorStdout"]);
});

test("native schema rejects field names inherited by its validator map", () => {
  for (const field of ["toString", "constructor"]) {
    const stdout = JSON.stringify({ permission: "allow", [field]: "unexpected" });
    expect(parseNativeCursorStdout(stdout, "preToolUse")).toBeNull();
  }
});

test("subagentStart ask adapts to deny and retains only its supported user message", () => {
  expect(toCursorLifecycleResponse(
    '{"permission":"ask","user_message":"approval needed","agent_message":"unsupported"}',
    "subagentStart",
  )).toBe('{"permission":"deny","user_message":"approval needed"}');
});

test("documented updated_input accepts deeply nested and dense valid JSON", () => {
  for (const depth of [63, 64, 1000]) {
    let nested: Record<string, unknown> = { leaf: true };
    for (let index = 0; index < depth; index += 1) nested = { nested };
    const stdout = JSON.stringify({ permission: "allow", updated_input: nested });
    expect(toCursorLifecycleResponse(stdout, "preToolUse"), `depth:${depth}`).toBe(stdout);
  }
  const stdout = JSON.stringify({ permission: "allow", updated_input: { values: Array.from({ length: 10_000 }, (_, index) => index) } });
  expect(toCursorLifecycleResponse(stdout, "preToolUse")).toBe(stdout);
});

test("raw native parsing rejects malformed JSON and schema-invalid JSON values", () => {
  for (const stdout of [
    "{", "null", "[]", '{"permission":"allow","updated_input":null}',
    '{"permission":"allow","updated_input":{"value":NaN}}',
  ]) {
    expect(parseNativeCursorStdout(stdout, "preToolUse"), stdout).toBeNull();
  }
});
