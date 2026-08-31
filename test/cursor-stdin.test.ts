import { expect, test } from "bun:test";
import { closeSync, mkdtempSync, openSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cursorReaderBounds, oversizeStdout, readCursorBounded, resolveCursorStdinMaxBytes } from "../src/cli/hook-io";

function readViaFile(text: string, cap: number): ReturnType<typeof readCursorBounded> {
  const file = join(mkdtempSync(join(tmpdir(), "cursor-stdin-")), "payload.json");
  writeFileSync(file, text);
  const fd = openSync(file, "r");
  try { return readCursorBounded(fd, cap); } finally { closeSync(fd); }
}

function oversizeResponse(payload: string, cap: number = 1024): string {
  const read = readViaFile(payload, cap);
  expect(read.kind).toBe("oversize");
  return oversizeStdout("cursor", read.kind === "oversize" ? read.head : "");
}

function payloadWithKeyAt(offset: number): string {
  const prefix = '{"content":"';
  const key = '"hook_event_name":"beforeTabFileRead"}';
  return `${prefix}${"x".repeat(offset - prefix.length - 2)}",${key}`;
}

function primitivePayloadAt(value: string, offset: number, duplicate = false): string {
  const prefix = duplicate ? `{"hook_event_name":null,"value":${value},"content":"` : `{"value":${value},"content":"`;
  const key = '"hook_event_name":"beforeTabFileRead"}';
  return `${prefix}${"x".repeat(offset - prefix.length - 2)}",${key}`;
}

test("oversized Cursor permission events fail closed with their native shape", () => {
  const stdout = oversizeStdout("cursor", '{"hook_event_name":"beforeReadFile"}');
  expect(JSON.parse(stdout)).toEqual({
    permission: "deny",
    user_message: expect.stringContaining("stdin payload exceeds"),
  });
});

test("oversized Cursor observation events return a neutral object", () => {
  expect(oversizeStdout("cursor", '{"hook_event_name":"afterFileEdit"}')).toBe("{}");
});

test("Cursor stdin cap clamps hostile environment overrides without changing the shared resolver", () => {
  expect(resolveCursorStdinMaxBytes({ FUSE_HOOK_STDIN_MAX_BYTES: "1" })).toBe(1);
  expect(resolveCursorStdinMaxBytes({ FUSE_HOOK_STDIN_MAX_BYTES: String(2 ** 30) })).toBe(64 * 1024 * 1024);
  expect(resolveCursorStdinMaxBytes({ FUSE_HOOK_STDIN_MAX_BYTES: "4096" })).toBe(4096);
});

test("oversize Cursor diagnostics report the effective clamped reader cap", () => {
  const previous = process.env.FUSE_HOOK_STDIN_MAX_BYTES;
  process.env.FUSE_HOOK_STDIN_MAX_BYTES = String(2 ** 30);
  try {
    const stdout = oversizeStdout("cursor", '{"hook_event_name":"beforeReadFile"}');
    const message = JSON.parse(stdout).user_message as string;
    expect(message).toContain("67108864 bytes");
    expect(message).not.toContain("1073741824 bytes");
  } finally {
    if (previous === undefined) delete process.env.FUSE_HOOK_STDIN_MAX_BYTES;
    else process.env.FUSE_HOOK_STDIN_MAX_BYTES = previous;
  }
});

test("Cursor reader exposes independent Buffer allocation requests and scanner cardinalities", () => {
  expect(cursorReaderBounds(1024)).toEqual({
    bufferAllocationRequestBytes: 1024 + 64 * 1024 + 4096 + 256,
    scannerTokenEntries: 256,
    scannerFrames: 1024,
  });
});

test("oversized Cursor detects a late top-level event independent of key order", () => {
  const payload = JSON.stringify({
    content: "x".repeat(5000),
    hook_event_name: "beforeTabFileRead",
    file_path: "/workspace/app.ts",
  });
  const read = readViaFile(payload, 1024);
  expect(read.kind).toBe("oversize");
  expect(oversizeStdout("cursor", read.kind === "oversize" ? read.head : ""))
    .toBe('{"permission":"deny"}');
});

test("oversized Cursor keeps explicit unknown and malformed policies", () => {
  expect(oversizeStdout("cursor", '{"hook_event_name":"futureCursorEvent"}')).toBe("{}");
  const malformed = readViaFile("x".repeat(5000), 1024);
  const response = JSON.parse(oversizeStdout("cursor", malformed.kind === "oversize" ? malformed.head : ""));
  expect(response.permission).toBe("deny");
});

test("oversized Cursor ignores nested and string decoys before a late real key", () => {
  const nested = `{"decoy":{"hook_event_name":"afterFileEdit"},"content":"${"x".repeat(70000)}","hook_event_name":"beforeTabFileRead"}`;
  const string = `{"content":"nested text \\\"hook_event_name\\\":\\\"afterFileEdit\\\" ${"x".repeat(70000)}","hook_event_name":"beforeTabFileRead"}`;
  expect(oversizeResponse(nested)).toBe('{"permission":"deny"}');
  expect(oversizeResponse(string)).toBe('{"permission":"deny"}');
});

test("oversized Cursor uses the last top-level key and decodes escaped key and value", () => {
  const duplicate = `{"hook_event_name":"afterFileEdit","content":"${"x".repeat(70000)}","hook_event_name":"beforeTabFileRead"}`;
  const escapedKey = `{"content":"${"x".repeat(70000)}","hook_event_\\u006eame":"beforeTabFileRead"}`;
  const escapedValue = `{"content":"${"x".repeat(70000)}","hook_event_name":"beforeTabFile\\u0052ead"}`;
  expect(oversizeResponse(duplicate)).toBe('{"permission":"deny"}');
  expect(oversizeResponse(escapedKey)).toBe('{"permission":"deny"}');
  expect(oversizeResponse(escapedValue)).toBe('{"permission":"deny"}');
});

test("oversized Cursor event scanning is invariant at chunk boundaries", () => {
  for (const offset of [65535, 65536]) {
    const payload = payloadWithKeyAt(offset);
    expect(payload.indexOf('"hook_event_name"')).toBe(offset);
    expect(oversizeResponse(payload)).toBe('{"permission":"deny"}');
  }
});

test("oversized Cursor resets object tokens around primitives at chunk boundaries", () => {
  for (const value of ["false", "true", "-1.25e+3", "null"]) {
    for (const offset of [65535, 65536]) {
      const payload = primitivePayloadAt(value, offset);
      expect(payload.indexOf('"hook_event_name"'), `${value}@${offset}`).toBe(offset);
      expect(oversizeResponse(payload), `${value}@${offset}`).toBe('{"permission":"deny"}');
    }
  }
});

test("oversized Cursor treats a null event followed by a valid duplicate as last-wins", () => {
  for (const offset of [65535, 65536]) {
    expect(oversizeResponse(primitivePayloadAt("0", offset, true))).toBe('{"permission":"deny"}');
  }
});

test("oversized Cursor streams arbitrarily long valid numbers before and after events", () => {
  for (const length of [256, 257, 10000]) {
    const number = "9".repeat(length);
    const observation = `{"hook_event_name":"afterFileEdit","value":${number},"pad":"${"x".repeat(2000)}"}`;
    const blockable = `{"value":${number},"pad":"${"x".repeat(70000)}","hook_event_name":"beforeTabFileRead"}`;
    JSON.parse(observation);
    JSON.parse(blockable);
    expect(oversizeResponse(observation), `observation:${length}`).toBe("{}");
    expect(oversizeResponse(blockable), `blockable:${length}`).toBe('{"permission":"deny"}');
  }
});

test("oversized Cursor streams long numbers across chunk boundaries", () => {
  for (const offset of [65535, 65536, 131071, 131072]) {
    const prefix = `{"pad":"${"x".repeat(offset - 18)}","value":`;
    const payload = `${prefix}${"7".repeat(10000)},"hook_event_name":"beforeTabFileRead"}`;
    JSON.parse(payload);
    expect(oversizeResponse(payload), String(offset)).toBe('{"permission":"deny"}');
  }
});

test("oversized Cursor rejects invalid JSON primitive grammar like JSON.parse", () => {
  for (const value of ["01", "1.", "1e", "-", "truex", "nulll"]) {
    const payload = `{"hook_event_name":"afterFileEdit","value":${value},"pad":"${"x".repeat(5000)}"}`;
    expect(() => JSON.parse(payload), value).toThrow();
    const response = JSON.parse(oversizeResponse(payload));
    expect(response.permission, value).toBe("deny");
  }
});

test("oversized Cursor treats unterminated JSON as indeterminate fail-closed", () => {
  const response = JSON.parse(oversizeResponse(`{"content":"${"x".repeat(70000)},"hook_event_name":"afterFileEdit"`));
  expect(response.permission).toBe("deny");
  expect(response).toHaveProperty("user_message");
  expect(response).toHaveProperty("agent_message");
});

test("every documented Cursor event has an exact native oversize schema", () => {
  const events: Record<string, string[]> = {
    sessionStart: [], sessionEnd: [], postToolUse: [], postToolUseFailure: [], subagentStop: [],
    afterShellExecution: [], afterMCPExecution: [], afterFileEdit: [], afterTabFileEdit: [],
    afterAgentResponse: [], afterAgentThought: [], stop: [], preCompact: [], workspaceOpen: [],
    beforeSubmitPrompt: ["continue", "user_message"],
    subagentStart: ["permission", "user_message"],
    preToolUse: ["agent_message", "permission", "user_message"],
    beforeShellExecution: ["agent_message", "permission", "user_message"],
    beforeMCPExecution: ["agent_message", "permission", "user_message"],
    beforeReadFile: ["permission", "user_message"],
    beforeTabFileRead: ["permission"],
  };
  for (const [event, keys] of Object.entries(events)) {
    const response = JSON.parse(oversizeResponse(`{"content":"${"x".repeat(5000)}","hook_event_name":"${event}"}`));
    expect(Object.keys(response).sort(), event).toEqual([...keys].sort());
    if (keys.includes("permission")) expect(response.permission, event).toBe("deny");
    if (keys.includes("continue")) expect(response.continue, event).toBe(false);
  }
});
