import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { postOutcome } from "../src/runtime/post-outcome";
import { runHook, spawnEnv } from "./sim/exec";

const fixtures = join(import.meta.dir, "sim", "fixtures");
const oversized = Array.from({ length: 400 }, (_, index) => `const line${index} = ${index};`).join("\n");

function runAdvisory(
  scope: string,
  fileName: string,
  content: string,
  setup?: (cwd: string) => void,
  envOverrides: Record<string, string> = {},
) {
  const cwd = mkdtempSync(join(tmpdir(), `cursor-${scope}-advisory-`));
  const filePath = join(cwd, fileName);
  try {
    setup?.(cwd);
    writeFileSync(filePath, content);
    const payload = {
      hook_event_name: "afterFileEdit",
      session_id: `${scope}-advisory`,
      file_path: filePath,
      edits: [{ old_string: "", new_string: content }],
    };
    const env = spawnEnv(fixtures, cwd, {
      FUSE_SOLID_MAX_LINES: "200",
      SOLID_PROJECT_TYPE: "generic",
      SOLID_FILE_LIMIT: "200",
      ...envOverrides,
    });
    const result = runHook("cursor", scope, payload, cwd, env);
    return { exit: result.exit, response: JSON.parse(result.stdout) as { permission?: string; user_message?: string } };
  } finally {
    rmSync(cwd, { recursive: true });
  }
}

test("Cursor core afterFileEdit emits no unsupported callback fields", () => {
  const result = runAdvisory("core", "app.ts", oversized);
  expect(result.exit).toBe(0);
  expect(result.response).toEqual({});
});

test("Cursor solid afterFileEdit emits no unsupported callback fields", () => {
  const result = runAdvisory("solid", "app.ts", oversized);
  expect(result.exit).toBe(0);
  expect(result.response).toEqual({});
});

test("Cursor solid afterFileEdit stays schema-empty when raw lines and LOC differ", () => {
  const content = [
    ...Array.from({ length: 188 }, (_, index) => `const line${index} = ${index};`),
    ...Array.from({ length: 13 }, (_, index) => `// spacer ${index}`),
  ].join("\n");
  const result = runAdvisory("solid", "app.ts", content, undefined, { SOLID_FILE_LIMIT: "180" });
  expect(result.exit).toBe(0);
  expect(result.response).toEqual({});
});

test("Cursor tailwind afterFileEdit emits no unsupported callback fields", () => {
  const content = ["@tailwind base;", ...Array.from({ length: 399 }, (_, index) => `.x${index} { @apply flex; }`)].join("\n");
  const result = runAdvisory("tailwindcss", "app.css", content, (cwd) => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ devDependencies: { tailwindcss: "4.1.0" } }));
  });
  expect(result.exit).toBe(0);
  expect(result.response).toEqual({});
});

test("Cursor degenerate afterFileEdit payloads never return deny", () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-degenerate-advisory-"));
  try {
    for (const edits of [[], undefined, null, { old_string: "a", new_string: "b" }]) {
      const payload: Record<string, unknown> = {
        hook_event_name: "afterFileEdit",
        session_id: "degenerate-advisory",
        file_path: join(cwd, "app.txt"),
      };
      if (edits !== undefined) payload.edits = edits;
      const result = runHook("cursor", "core", payload, cwd, spawnEnv(fixtures, cwd));
      expect(result.exit).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({});
    }
  } finally {
    rmSync(cwd, { recursive: true });
  }
});

test("Cursor post outputs use the event-specific schema without changing other harnesses", () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-post-schema-"));
  const base = {
    agentId: "",
    sessionId: "post-schema",
    now: 1000,
    cwd,
    activities: [],
    files: [],
    designCacheDir: cwd,
    designWarn: { kind: "block", title: "Design", reason: "review required" } as const,
    extra: "",
    cursorAfterFileEdit: false,
  };
  try {
    const postTool = postOutcome({ ...base, id: "cursor", cursorEventName: "postToolUse" });
    const parsed = JSON.parse(postTool.stdout) as { permission?: string; additional_context?: string };
    expect(parsed.permission).toBeUndefined();
    expect(parsed.additional_context).toContain("review required");
    expect(postOutcome({ ...base, id: "cursor", cursorEventName: "afterShellExecution" }).stdout).toBe("");
    expect(postOutcome({ ...base, id: "claude-code", cursorEventName: "" }).stdout).toContain("hookSpecificOutput");
    expect(postOutcome({ ...base, id: "kimi", cursorEventName: "" }).stdout).toContain("hookSpecificOutput");
  } finally {
    rmSync(cwd, { recursive: true });
  }
});
