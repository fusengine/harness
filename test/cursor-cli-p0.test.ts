import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { isAbsolute, join, resolve } from "node:path";

const simBin = process.env.SIM_BIN;
const bin = simBin
  ? (isAbsolute(simBin) ? simBin : resolve(import.meta.dir, "..", simBin))
  : join(import.meta.dir, "..", "src", "cli", "bin.ts");
const runtime = simBin ? "node" : "bun";
const commands = [
  { name: "root-delete", value: ["rm", "-rf", "/"].join(" "), permission: "deny" },
  { name: "source-sed", value: ["sed", "-i", "'s/a/b/'", "src/app.ts"].join(" "), permission: "deny" },
  { name: "install", value: ["npm", "install"].join(" "), permission: "deny" },
  { name: "safe", value: ["ls", "-la"].join(" "), permission: "allow" },
] as const;

function runCursor(payload: Record<string, unknown>, env: Record<string, string> = {}): { exit: number; permission: string; stdout: string } {
  const child = spawnSync(runtime, [bin, "hook", "cursor", "core"], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, FUSE_ENFORCE_TTL_SEC: "3600", ...env },
  });
  const stdout = child.stdout.trim();
  const permission = stdout ? (JSON.parse(stdout) as { permission?: string }).permission ?? "allow" : "allow";
  return { exit: child.status ?? 1, permission, stdout };
}

function runRaw(id: string, input: string): { exit: number; stdout: string } {
  const child = spawnSync(runtime, [bin, "hook", id, "core"], {
    input,
    encoding: "utf8",
    env: { ...process.env, FUSE_ENFORCE_TTL_SEC: "3600" },
  });
  return { exit: child.status ?? 1, stdout: child.stdout };
}

test("Cursor CLI gates documented beforeShellExecution and preToolUse Shell payloads", () => {
  const shapes = [
    (command: string): Record<string, unknown> => ({ hook_event_name: "beforeShellExecution", command, cwd: process.cwd(), sandbox: false }),
    (command: string): Record<string, unknown> => ({ hook_event_name: "preToolUse", tool_name: "Shell", tool_input: { command, working_directory: process.cwd() } }),
  ];
  for (const shape of shapes) {
    for (const command of commands) {
      const { exit, permission } = runCursor(shape(command.value));
      expect({ exit, permission }, command.name).toEqual({ exit: 0, permission: command.permission });
    }
  }
});

test("Cursor CLI keeps documented afterFileEdit observe-only without unsupported fields", () => {
  const filePath = join(process.cwd(), `.cursor-p0-${process.pid}.ts`);
  const result = runCursor({
    hook_event_name: "afterFileEdit",
    file_path: filePath,
    edits: [{ old_string: "const value = 1", new_string: "const value = 2" }],
  });
  expect({ exit: result.exit, response: JSON.parse(result.stdout) }).toEqual({ exit: 0, response: {} });
});

test("Cursor CLI returns exact permission-only allow and deny for documented beforeTabFileRead", () => {
  const allow = runCursor({
    hook_event_name: "beforeTabFileRead",
    file_path: join(process.cwd(), "src", "index.ts"),
    content: "export {};",
  });
  expect({ exit: allow.exit, response: JSON.parse(allow.stdout) }).toEqual({
    exit: 0,
    response: { permission: "allow" },
  });
  const deny = runCursor({
    hook_event_name: "beforeTabFileRead",
    file_path: join(process.cwd(), "src", "oversized.ts"),
    content: "x".repeat(256),
  }, { FUSE_HOOK_STDIN_MAX_BYTES: "128" });
  expect({ exit: deny.exit, response: JSON.parse(deny.stdout) }).toEqual({
    exit: 0,
    response: { permission: "deny" },
  });
});

test("Cursor malformed non-empty stdin exits nonzero without stdout while empty and other harnesses keep parity", () => {
  expect(runRaw("cursor", "{not-json")).toEqual({ exit: 1, stdout: "" });
  expect(runRaw("cursor", "")).toEqual({ exit: 0, stdout: "{}" });
  expect(runRaw("claude-code", "{not-json")).toEqual({ exit: 0, stdout: "" });
  expect(runRaw("codex", "{not-json")).toEqual({ exit: 0, stdout: "" });
  expect(runRaw("kimi", "{not-json")).toEqual({ exit: 0, stdout: "" });
});
