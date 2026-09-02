import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const simBin = process.env.SIM_BIN;
/** Resolved CLI entry point (source `bin.ts`, or a `SIM_BIN` override for the compiled binary). */
export const bin: string = simBin
  ? (isAbsolute(simBin) ? simBin : resolve(import.meta.dir, "..", simBin))
  : join(import.meta.dir, "..", "src", "cli", "bin.ts");
/** `node` when running a compiled `SIM_BIN`, else `bun` for the TypeScript source. */
export const runtime: "node" | "bun" = simBin ? "node" : "bun";
const commands = [
  { name: "root-delete", value: ["rm", "-rf", "/"].join(" "), permission: "deny" },
  { name: "source-sed", value: ["sed", "-i", "'s/a/b/'", "src/app.ts"].join(" "), permission: "deny" },
  { name: "install", value: ["npm", "install"].join(" "), permission: "deny" },
  { name: "safe", value: ["ls", "-la"].join(" "), permission: "allow" },
] as const;

/**
 * Run `fn` with a dedicated tmp dir used as both the child's `cwd` and its
 * `CURSOR_PROJECT_DIR`, so the harness's own side-channel writes (docs cache,
 * session tracks keyed by the project dir) never land in this checkout.
 * Always cleaned up, even if `fn` throws.
 */
function withIsolatedCwd<T>(fn: (cwd: string) => T): T {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-cli-p0-"));
  try {
    return fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

// `HOME: cwd` (F1): the spawned child reads HOME fresh at process start, so
// any Cursor `additional_context` budget registry write lands under
// `<cwd>/.fuse-harness/state/...` instead of the real
// `~/.fuse-harness/state/...` — cleaned up by `withIsolatedCwd`'s rmSync.
function runCursor(payload: Record<string, unknown>, env: Record<string, string> = {}): { exit: number; permission: string; stdout: string } {
  return withIsolatedCwd((cwd) => {
    const child = spawnSync(runtime, [bin, "hook", "cursor", "core"], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      cwd,
      env: { ...process.env, FUSE_ENFORCE_TTL_SEC: "3600", CURSOR_PROJECT_DIR: cwd, HOME: cwd, ...env },
    });
    const stdout = child.stdout.trim();
    const permission = stdout ? (JSON.parse(stdout) as { permission?: string }).permission ?? "allow" : "allow";
    return { exit: child.status ?? 1, permission, stdout };
  });
}

/** Spawn the CLI for one harness id/scope and return raw stdout (never trimmed). */
export function runRaw(id: string, input: string): { exit: number; stdout: string } {
  return withIsolatedCwd((cwd) => {
    const child = spawnSync(runtime, [bin, "hook", id, "core"], {
      input,
      encoding: "utf8",
      cwd,
      env: { ...process.env, FUSE_ENFORCE_TTL_SEC: "3600", CURSOR_PROJECT_DIR: cwd, HOME: cwd },
    });
    return { exit: child.status ?? 1, stdout: child.stdout };
  });
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

// afterFileEdit: verdict computed on edits[] but not emitted — documented
// loss, Cursor's afterFileEdit validator reads no response fields (agent-cli
// 190.index.js). Why: under `--scope solid` specifically, `handle-post.ts`
// DOES fan this event's edits[] into a real SOLID file-size verdict via
// `checkFileSize`/`firstFileMatch` — but `postOutcome`'s `cursorAfterFileEdit`
// short-circuit (src/runtime/post-outcome.ts:50-52) always returns `{}`
// before that verdict (or any other scope's warning) can be emitted, because
// Cursor's own validator for this event accepts no response fields at all —
// emitting anything else would be undeliverable, not merely unread. This
// test runs under `--scope core`, where no SOLID verdict is computed in the
// first place (checkFileSize is solid-scope-only), and the edited path is a
// plain `.ts` file that `activity.ts` never classifies for doc/agent/ref
// credit — so there is no OTHER observable tracking side effect here to
// assert either; `{}` is genuinely the full, correct, and only outcome.
test("Cursor CLI: afterFileEdit verdict computed on edits[] but not emitted — documented loss, Cursor's afterFileEdit validator reads no response fields (agent-cli 190.index.js)", () => {
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
