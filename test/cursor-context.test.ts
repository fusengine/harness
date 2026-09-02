import { expect, test } from "bun:test";
import { normalizeEvent } from "../src/runtime/normalize";
import { handleHook } from "../src/runtime/handle";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cursorAbsolutePath, cursorProjectCwd } from "../src/adapters/cursor/context";

test("Cursor path validation rejects filesystem-invalid NUL bytes", () => {
  expect(cursorAbsolutePath("/workspace/\0secret")).toBeUndefined();
});

test("Cursor normalization removes NUL paths from read, tool, and edit wiring", async () => {
  const readPayload = {
    hook_event_name: "beforeReadFile",
    file_path: "/workspace/\0secret",
    cwd: "/workspace/\0cwd",
    workspace_roots: ["/workspace/\0root", "/workspace/valid"],
    content: "preserve-content",
  };
  const read = normalizeEvent("cursor", readPayload);
  expect(read.input).not.toBe(readPayload);
  expect([read.phase, read.tool, read.filePath, read.input.file_path, read.cwd, read.workspaceRoots])
    .toEqual(["pre", "Read", undefined, undefined, undefined, ["/workspace/valid"]]);
  expect(read.input.content).toBe("preserve-content");
  expect(readPayload.file_path).toContain("\0");
  expect(readPayload.workspace_roots).toHaveLength(2);

  const tool = normalizeEvent("cursor", {
    hook_event_name: "preToolUse",
    tool_name: "Write",
    tool_input: { file_path: "/workspace/\0tool.ts", path: "/workspace/\0fallback.ts", content: "x" },
  });
  expect([tool.filePath, tool.input.file_path, tool.input.path])
    .toEqual([undefined, undefined, undefined]);

  const editPayload = {
    hook_event_name: "afterFileEdit",
    file_path: "/workspace/\0edit.ts",
    edits: [{ old_string: "a", new_string: "b" }],
  };
  const edit = normalizeEvent("cursor", editPayload);
  expect([edit.phase, edit.tool, edit.filePath, edit.files, edit.input.file_path])
    .toEqual(["post", "Edit", undefined, undefined, undefined]);
  expect(await handleHook("cursor", editPayload, { now: 1000, cwd: "/workspace" }))
    .toEqual({ stdout: "{}", exit: 0 });
});

test("Cursor sanitizes mixed top-level paths without mutating valid edit payloads", () => {
  const payload = {
    hook_event_name: "afterFileEdit",
    file_path: "/workspace/valid.ts",
    path: "/workspace/\0invalid-path.ts",
    cwd: "/workspace/\0invalid-cwd",
    workspace_roots: ["/workspace/\0invalid-root", "/workspace/valid-root"],
    edits: [{ old_string: "a", new_string: "b" }],
    audit_tag: "preserve-me",
  };
  const event = normalizeEvent("cursor", payload);
  expect(event.input).not.toBe(payload);
  expect(event.input).toMatchObject({
    file_path: "/workspace/valid.ts",
    workspace_roots: ["/workspace/valid-root"],
    edits: payload.edits,
    audit_tag: "preserve-me",
  });
  expect(event.input).not.toHaveProperty("path");
  expect(event.input).not.toHaveProperty("cwd");
  expect(event.files).toEqual([{
    filePath: "/workspace/valid.ts",
    oldString: "a",
    content: "b",
    op: "update",
  }]);
  expect(payload.path).toContain("\0");
  expect(payload.cwd).toContain("\0");
  expect(payload.workspace_roots).toHaveLength(2);
});

test("Cursor normalization preserves validated cwd and distinct workspace roots", () => {
  const event = normalizeEvent("cursor", {
    hook_event_name: "preToolUse",
    cwd: "/workspace/root-b/../root-b",
    workspace_roots: ["/workspace/root-a", "", "/workspace/root-b", "/workspace/root-a", "relative/root"],
    tool_name: "Read",
    tool_input: { file_path: "/workspace/root-a/src/app.ts" },
  });
  expect(event.cwd).toBe("/workspace/root-b");
  expect(event.workspaceRoots).toEqual(["/workspace/root-a", "/workspace/root-b"]);
});

test("Cursor multi-root selection canonicalizes symlinks before choosing the file root", () => {
  const base = mkdtempSync(join(tmpdir(), "cursor-multi-root-"));
  const actual = join(base, "actual workspace");
  const alias = join(base, "workspace-link");
  mkdirSync(join(actual, "src"), { recursive: true });
  symlinkSync(actual, alias);
  try {
    const event = normalizeEvent("cursor", {
      hook_event_name: "preToolUse",
      workspace_roots: [alias, actual],
      tool_name: "Write",
      tool_input: { file_path: join(actual, "src", "app.ts"), content: "export {};" },
    });
    const canonical = realpathSync.native(actual);
    expect(event.workspaceRoots).toEqual([canonical]);
    expect(cursorProjectCwd(event.cwd, event.workspaceRoots ?? [], event.filePath, "/fallback")).toBe(canonical);
  } finally {
    rmSync(base, { recursive: true });
  }
});

test("cursorProjectCwd: filePath in the second of two workspace roots selects the second", () => {
  const roots = ["/ws/root-a", "/ws/root-b"];
  expect(cursorProjectCwd(undefined, roots, "/ws/root-b/src/app.ts", "/fallback")).toBe("/ws/root-b");
});

test("cursorProjectCwd: filePath outside every workspace root falls back to the first root", () => {
  const roots = ["/ws/root-a", "/ws/root-b"];
  expect(cursorProjectCwd(undefined, roots, "/elsewhere/app.ts", "/fallback")).toBe("/ws/root-a");
});

test("cursorProjectCwd: empty workspaceRoots + CURSOR_PROJECT_DIR env wins over fallback", () => {
  expect(cursorProjectCwd(undefined, [], undefined, "/fallback", { CURSOR_PROJECT_DIR: "/env/project" }))
    .toBe("/env/project");
});

test("cursorProjectCwd: CLAUDE_PROJECT_DIR used only when CURSOR_PROJECT_DIR is absent", () => {
  expect(cursorProjectCwd(undefined, [], undefined, "/fallback", { CLAUDE_PROJECT_DIR: "/env/claude-project" }))
    .toBe("/env/claude-project");
  expect(cursorProjectCwd(undefined, [], undefined, "/fallback", {
    CURSOR_PROJECT_DIR: "/env/cursor-project",
    CLAUDE_PROJECT_DIR: "/env/claude-project",
  })).toBe("/env/cursor-project");
});

test("cursorProjectCwd: everything absent falls back to the explicit fallback, never process.cwd()", () => {
  expect(cursorProjectCwd(undefined, [], undefined, "/fallback", {})).toBe("/fallback");
});

test("cursorProjectCwd: payload cwd still wins over env when present", () => {
  expect(cursorProjectCwd("/payload/cwd", [], undefined, "/fallback", { CURSOR_PROJECT_DIR: "/env/project" }))
    .toBe("/payload/cwd");
});

test("Cursor payload cwd scopes lifecycle project detection instead of process fallback", async () => {
  const payloadCwd = mkdtempSync(join(tmpdir(), "cursor-payload-cwd-"));
  const fallbackCwd = mkdtempSync(join(tmpdir(), "cursor-fallback-cwd-"));
  writeFileSync(join(payloadCwd, "package.json"), "{}");
  try {
    const outcome = await handleHook("cursor", {
      hook_event_name: "sessionStart",
      conversation_id: "cursor-project-cwd",
      cwd: payloadCwd,
      workspace_roots: [payloadCwd],
    }, { now: 1000, cwd: fallbackCwd, home: payloadCwd });
    const response = JSON.parse(outcome.stdout) as { additional_context?: string };
    expect(response.additional_context).toContain("Project: Node.js");
  } finally {
    rmSync(payloadCwd, { recursive: true });
    rmSync(fallbackCwd, { recursive: true });
  }
});
