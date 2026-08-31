import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { denyResponse } from "../src/adapters/claude";
import { beforeShellExecution } from "../src/adapters/cursor";
import { cursorEventContract } from "../src/adapters/cursor/events";
import { extractCursorEvent } from "../src/adapters/cursor/normalize";
import { toCursorLifecycleResponse } from "../src/adapters/cursor/respond";
import { clearUserGuards, registerGuard } from "../src/policy/guards";
import { asyncScopeStdout } from "../src/runtime/handle-scope-async";
import { handleHook } from "../src/runtime/handle";
import { lifecycleStdout } from "../src/runtime/lifecycle-bridge";
import { respond } from "../src/runtime/respond";

test("Cursor lifecycle names map explicitly and unknown events stay neutral", () => {
  expect(cursorEventContract("sessionStart")).toMatchObject({
    phase: "pre", lifecycle: "SessionStart", response: "session-context",
  });
  expect(cursorEventContract("postToolUseFailure")).toMatchObject({
    phase: "post", lifecycle: "PostToolUseFailure", response: "neutral",
  });
  expect(cursorEventContract("preToolUse").lifecycle).toBe("PreToolUse");
  expect(cursorEventContract("futureCursorEvent")).toMatchObject({
    phase: "post", lifecycle: null, response: "neutral",
  });
});

test("unknown Cursor events remain observation-only during normalization", () => {
  expect(extractCursorEvent({ hook_event_name: "futureCursorEvent", command: "rm -rf /" })).toMatchObject({
    phase: "post", tool: "", eventName: "futureCursorEvent", lifecycleEvent: null,
    responseKind: "neutral", blockable: false,
  });
});

test("missing or invalid event names never infer a dangerous lifecycle branch", () => {
  const payloads: Record<string, unknown>[] = [
    { edits: [{ old_string: "safe", new_string: "safe" }], file_path: "/workspace/app.ts", command: "rm -rf /" },
    { hook_event_name: null, command: "rm -rf /" },
    { hook_event_name: 42, command: "rm -rf /" },
    { hook_event_name: "futureCursorEvent", command: "rm -rf /" },
  ];
  for (const payload of payloads) {
    expect(extractCursorEvent(payload)).toMatchObject({ phase: "post", tool: "", responseKind: "neutral", blockable: false });
  }
});

test("Cursor responses use each event's native serialized shape", () => {
  const block = { kind: "block", title: "Protected file", reason: "read denied" } as const;
  expect(respond("cursor", block, "beforeReadFile")).toBe(
    '{"permission":"deny","user_message":"[BLOCKED] Protected file\\nread denied"}',
  );
  expect(respond("cursor", block, "beforeShellExecution")).toBe(
    '{"permission":"deny","user_message":"[BLOCKED] Protected file\\nread denied","agent_message":"[BLOCKED] Protected file\\nread denied"}',
  );
  expect(respond("cursor", block, "beforeTabFileRead")).toBe('{"permission":"deny"}');
  const note = { kind: "inform", title: "Receipt", reason: "tool observed" } as const;
  expect(respond("cursor", note, "postToolUse")).toBe(
    '{"additional_context":"[NOTE] Receipt\\ntool observed"}',
  );
  expect(respond("cursor", block, "futureCursorEvent")).toBe("{}");
});

test("beforeReadFile enforces the shared policy chain with native deny output", async () => {
  clearUserGuards();
  registerGuard(({ tool }) => tool === "Read"
    ? { kind: "block", title: "Read policy", reason: "blocked by shared guard" }
    : null);
  try {
    const outcome = await handleHook("cursor", {
      hook_event_name: "beforeReadFile", conversation_id: "cursor-read-deny", file_path: "/workspace/private.txt",
    }, { now: 1000, cwd: "/workspace" });
    expect(outcome).toEqual({
      stdout: '{"permission":"deny","user_message":"[BLOCKED] Read policy\\nblocked by shared guard"}', exit: 0,
    });
  } finally { clearUserGuards(); }
});

test("beforeTabFileRead normalizes Read and enforces native allow and deny", async () => {
  const payload = {
    hook_event_name: "beforeTabFileRead", conversation_id: "cursor-tab-read",
    file_path: "/workspace/tab.ts", content: "export {};",
  };
  const normalized = extractCursorEvent(payload);
  expect([normalized.phase, normalized.tool, normalized.filePath, normalized.content])
    .toEqual(["pre", "Read", "/workspace/tab.ts", "export {};"]);
  expect(await handleHook("cursor", payload, { now: 1000, cwd: "/workspace" }))
    .toEqual({ stdout: '{"permission":"allow"}', exit: 0 });
  clearUserGuards();
  registerGuard(({ tool }) => tool === "Read"
    ? { kind: "block", title: "Tab read policy", reason: "blocked by shared guard" }
    : null);
  try {
    expect(await handleHook("cursor", payload, { now: 1000, cwd: "/workspace" })).toEqual({
      stdout: '{"permission":"deny"}', exit: 0,
    });
  } finally { clearUserGuards(); }
});

test("lower-camel Cursor lifecycle names reach the internal dispatcher", () => {
  expect(lifecycleStdout(
    { hook_event_name: "sessionEnd", conversation_id: "cursor-session" },
    "/workspace", "aipilot", 1000, "cursor",
  )).toBe("{}");
});

test("Cursor sessionStart converts lifecycle context to its native envelope", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-session-start-"));
  writeFileSync(join(cwd, "package.json"), "{}");
  try {
    const outcome = await handleHook("cursor", {
      hook_event_name: "sessionStart", conversation_id: "cursor-session-start", workspace_roots: [cwd], cwd,
    }, { now: 1000, cwd });
    const response = JSON.parse(outcome.stdout) as Record<string, unknown>;
    expect(typeof response.additional_context).toBe("string");
    expect(response).not.toHaveProperty("hookSpecificOutput");
    expect(response).not.toHaveProperty("systemMessage");
  } finally { rmSync(cwd, { recursive: true }); }
});

test("Cursor async scope canonicalizes lower-camel lifecycle names", async () => {
  const outcome = await asyncScopeStdout(
    "aipilot", "subagentStop", { agent_type: "explore" }, "/workspace", 1000, "cursor",
  );
  expect(outcome).toBe("{}");
});

test("Cursor async scope preserves a shared dispatcher deny natively", () => {
  expect(toCursorLifecycleResponse(
    denyResponse("PreToolUse", "cached documentation must be read locally"), "preToolUse",
  )).toBe(
    '{"permission":"deny","user_message":"cached documentation must be read locally","agent_message":"cached documentation must be read locally"}',
  );
});

test("Cursor public permission wrapper emits no unsupported continue field", () => {
  expect(beforeShellExecution({ command: "rm -rf /" })).toEqual({
    permission: "deny", user_message: expect.any(String), agent_message: expect.any(String),
  });
});
