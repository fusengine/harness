import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleHook } from "../src/runtime/handle";

const root = (prefix: string): string => mkdtempSync(join(tmpdir(), prefix));

test("Cursor security advisory crosses the runtime boundary as native agent context", async () => {
  const cwd = root("cursor-security-");
  const out = await handleHook("cursor", {
    hook_event_name: "preToolUse",
    conversation_id: "cursor-security",
    tool_name: "Write",
    tool_input: { file_path: join(cwd, "app.ts"), content: "export {};" },
  }, { now: 1, cwd, scope: "security", home: cwd });
  expect(out).toEqual({
    stdout: expect.stringContaining('"permission":"allow"'),
    exit: 0,
  });
  const parsed = JSON.parse(out.stdout) as Record<string, unknown>;
  expect(parsed.agent_message).toContain("SECURITY");
  expect(parsed).not.toHaveProperty("hookSpecificOutput");
});

test("Cursor solid deny crosses the runtime boundary as native permission", async () => {
  const cwd = root("cursor-solid-");
  const previous = process.env.SOLID_PROJECT_TYPE;
  process.env.SOLID_PROJECT_TYPE = "go";
  try {
    const out = await handleHook("cursor", {
      hook_event_name: "preToolUse",
      conversation_id: "cursor-solid",
      tool_name: "Write",
      tool_input: { file_path: join(cwd, "store.go"), content: "type Store interface {\n}\n" },
    }, { now: 1, cwd, scope: "solid", home: cwd });
    const parsed = JSON.parse(out.stdout) as Record<string, unknown>;
    expect(parsed.permission).toBe("deny");
    expect(parsed.agent_message).toContain("internal/interfaces/");
    expect(parsed).not.toHaveProperty("hookSpecificOutput");
  } finally {
    if (previous === undefined) delete process.env.SOLID_PROJECT_TYPE;
    else process.env.SOLID_PROJECT_TYPE = previous;
  }
});

test("Cursor scoped postToolUse crosses the runtime boundary as native post context", async () => {
  const cwd = root("cursor-seo-");
  writeFileSync(join(cwd, ".fuse-seo"), "");
  const file = join(cwd, "page.html");
  writeFileSync(file, "<html><head></head><body>hi</body></html>");
  const out = await handleHook("cursor", {
    hook_event_name: "postToolUse",
    conversation_id: "cursor-seo",
    tool_name: "Write",
    tool_input: { file_path: file, content: "" },
    tool_output: "ok",
    cwd,
  }, { now: 1, cwd, scope: "seo", home: cwd });
  const parsed = JSON.parse(out.stdout) as Record<string, unknown>;
  expect(parsed.additional_context).toContain("missing SEO elements");
  expect(parsed).not.toHaveProperty("decision");
  expect(parsed).not.toHaveProperty("hookSpecificOutput");
});

test("non-Cursor scope responses retain their existing wire shapes", async () => {
  const cwd = root("native-boundary-control-");
  const payload = {
    hook_event_name: "PreToolUse",
    session_id: "control-security",
    tool_name: "Write",
    tool_input: { file_path: join(cwd, "app.ts"), content: "export {};" },
  };
  const expected = '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"SECURITY: Read security skill references before modifying code. Use: Read skills/security-scan/references/scan-patterns.md"}}';
  for (const id of ["claude-code", "codex", "kimi"] as const) {
    const out = await handleHook(id, payload, { now: 1, cwd, scope: "security" });
    expect(out).toEqual({ stdout: expected, exit: 0 });
  }
});
