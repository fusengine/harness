import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleHook } from "../src/runtime/handle";

const root = (prefix: string): string => mkdtempSync(join(tmpdir(), prefix));

test("Cursor subagentStart never claims that unsupported rule context was injected", async () => {
  const cwd = root("cursor-subagent-rules-");
  mkdirSync(join(cwd, "rules"));
  const sentinel = "CURSOR_SUBAGENT_RULE_SENTINEL";
  writeFileSync(join(cwd, "rules", "00-rules.md"), sentinel);
  const out = await handleHook("cursor", {
    hook_event_name: "subagentStart",
    conversation_id: "cursor-subagent",
    subagent_id: "child-1",
    subagent_type: "explore",
    task: "inspect",
  }, { now: 1, cwd, scope: "rules", home: root("cursor-subagent-home-") });
  expect(out).toEqual({ stdout: '{"permission":"allow"}', exit: 0 });
  expect(out.stdout).not.toContain(sentinel);
  expect(out.stdout).not.toContain("injected");
});

test("Cursor CLI throws as a host-visible process failure without raw hook stdout", () => {
  const cwd = root("cursor-cli-throw-");
  const refs = join(cwd, "refs");
  mkdirSync(join(refs, "unreadable.md"), { recursive: true });
  const home = root("cursor-cli-throw-home-");
  const child = spawnSync("bun", [join(import.meta.dir, "..", "src", "cli", "bin.ts"), "hook", "cursor", "core"], {
    cwd,
    input: JSON.stringify({
      hook_event_name: "preToolUse",
      conversation_id: "cursor-cli-throw",
      tool_name: "Shell",
      tool_input: { command: "ls" },
    }),
    encoding: "utf8",
    env: { ...process.env, HOME: home, FUSE_HARNESS_REFS: refs },
  });
  expect(child.status).not.toBe(0);
  expect(child.stdout).toBe("");
  expect(child.stderr).not.toContain("hookSpecificOutput");
});

test("Cursor CLI non-oversize JSON uses the last duplicate top-level event key", () => {
  const cwd = root("cursor-cli-duplicate-");
  const input = `{"hook_event_name":"afterFileEdit","hook_event_name":"beforeTabFileRead","file_path":${JSON.stringify(join(cwd, "tab.ts"))},"content":"export {};"}`;
  const child = spawnSync("bun", [join(import.meta.dir, "..", "src", "cli", "bin.ts"), "hook", "cursor", "core"], {
    cwd,
    input,
    encoding: "utf8",
    env: { ...process.env, HOME: root("cursor-cli-duplicate-home-") },
  });
  expect(child.status).toBe(0);
  expect(child.stdout).toBe('{"permission":"allow"}');
});
