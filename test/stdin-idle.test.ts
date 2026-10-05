/**
 * Hook process lifetime: a `harness hook` process must end by itself once it
 * has nothing left to receive. Integration tests spawn the real entry
 * (`bun src/cli/bin.ts hook <id> core`) in an isolated HOME/CODEX_HOME and
 * keep stdin OPEN, which hung forever before the idle-aware reader.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = join(import.meta.dir, "..", "src", "cli", "bin.ts");
const HUNG_AFTER_MS = 8000;
const sandbox = mkdtempSync(join(tmpdir(), "fh-stdin-idle-"));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

interface Run { stdout: string; code: number | null; signal: string | null; ms: number; hung: boolean }

/** Spawn the hook entry; `closeStdin` false leaves the pipe open after the write. */
function runHook(id: string, input: string | string[] | null, closeStdin: boolean, env: Record<string, string> = {}, gapMs = 40): Promise<Run> {
  return new Promise((resolve) => {
    const home = mkdtempSync(join(sandbox, "run-")); // fresh state per run: once-per-session output must not diverge
    const t0 = performance.now();
    const child = spawn("bun", [BIN, "hook", id, "core"], {
      cwd: sandbox,
      env: { ...process.env, HOME: home, CODEX_HOME: join(home, ".codex"), CI: "", FUSE_HARNESS_DEBUG: "", ...env },
      stdio: ["pipe", "pipe", "ignore"],
    });
    let stdout = "";
    let hung = false;
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
    const timer = setTimeout(() => { hung = true; child.kill("SIGKILL"); }, HUNG_AFTER_MS);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ stdout, code, signal, ms: performance.now() - t0, hung });
    });
    const writes = input === null ? [] : Array.isArray(input) ? input : [input];
    writes.forEach((w, i) => setTimeout(() => child.stdin.write(w), i * gapMs)); // default 40 ms apart: inside the settle grace
    if (closeStdin) setTimeout(() => child.stdin.end(), writes.length * gapMs);
  });
}

const pre = (id: string): string => JSON.stringify({
  hook_event_name: "PreToolUse", session_id: `s-${id}`, cwd: sandbox, tool_name: "Bash", tool_input: { command: "ls" },
});

for (const id of ["codex", "claude-code"]) {
  describe(`hook ${id}: stdin lifetime`, () => {
    test("(c) closed stdin: unchanged, exits on its own", async () => {
      const r = await runHook(id, pre(id), true);
      expect(r.hung).toBe(false);
      expect(r.code).toBe(0);
    }, 20000);

    test("(a) payload written, stdin LEFT OPEN: exits promptly, same stdout and code as closed", async () => {
      const closed = await runHook(id, pre(id), true);
      const open = await runHook(id, pre(id), false);
      expect(open.hung).toBe(false);
      expect(open.signal).toBeNull();
      expect(open.stdout).toBe(closed.stdout);
      expect(open.code).toBe(closed.code);
      expect(open.ms).toBeLessThan(4000);
    }, 30000);

    test("(a2) PostToolUse + Stop + SessionStart with stdin left open all exit", async () => {
      for (const event of ["PostToolUse", "Stop", "SessionStart", "UserPromptSubmit"]) {
        const payload = JSON.stringify({ hook_event_name: event, session_id: `s-${id}`, cwd: sandbox, prompt: "hi", tool_name: "Bash", tool_input: { command: "ls" }, tool_response: "" });
        const closed = await runHook(id, payload, true);
        const open = await runHook(id, payload, false);
        expect([event, open.hung]).toEqual([event, false]);
        expect([event, open.stdout, open.code]).toEqual([event, closed.stdout, closed.code]);
      }
    }, 60000);

    test("(a3) payload + trailing garbage / second object, stdin left open: ends at the partial bound, fail closed", async () => {
      const p = pre(id);
      for (const tail of [" garbage", p]) {
        const open = await runHook(id, [p + tail], false, { FUSE_HOOK_STDIN_IDLE_MS: "300", FUSE_HOOK_STDIN_PARTIAL_MS: "600" });
        expect([tail.length, open.hung]).toEqual([tail.length, false]);
        expect(open.stdout).toContain("denied uninspected");
      }
    }, 30000);

    test("(a4) payload then a trailing newline in a LATER write, stdin left open: drained within the grace, outcome as EOF", async () => {
      const p = pre(id);
      const eof = await runHook(id, [p, "\n"], true);
      const open = await runHook(id, [p, "\n"], false, { FUSE_HOOK_STDIN_IDLE_MS: "300", FUSE_HOOK_STDIN_GRACE_MS: "2000" });
      expect(open.hung).toBe(false);
      expect([open.stdout, open.code]).toEqual([eof.stdout, eof.code]);
    }, 30000);

    test("(b) closed empty stdin stays `{}`; nothing written with stdin NEVER closed fails closed at the bound (no early `{}`)", async () => {
      const empty = await runHook(id, null, true);
      expect(empty.code).toBe(0);
      const never = await runHook(id, null, false, { FUSE_HOOK_STDIN_IDLE_MS: "300", FUSE_HOOK_STDIN_PARTIAL_MS: "900" });
      expect(never.hung).toBe(false);
      expect(never.stdout).toContain("denied uninspected");
      expect(never.ms).toBeGreaterThanOrEqual(850); // waited the whole bound, not the 300 ms idle hint
      expect(never.ms).toBeLessThan(4000);
    }, 30000);

    test("(E) ZERO bytes for longer than the old idle window, then the full deny payload and EOF: denies like main", async () => {
      const env = { FUSE_HOOK_STDIN_IDLE_MS: "300", FUSE_HOOK_STDIN_PARTIAL_MS: "5000" };
      const full = pushHead(id) + pushTail;
      const main = await runHook(id, [full], true);
      const late = await runHook(id, ["", full], true, env, 800); // first byte at +800 ms, EOF at +1600 ms
      expect(main.stdout).toContain("deny");
      expect(late.hung).toBe(false);
      expect([late.stdout, late.code]).toEqual([main.stdout, main.code]);
    }, 30000);

    test("(b2) partial payload then EOF is unchanged (`{}` outcome); left open it fails closed at the partial bound", async () => {
      const partial = pre(id).slice(0, 20);
      const eof = await runHook(id, partial, true);
      const empty = await runHook(id, null, true);
      expect([eof.stdout, eof.code]).toEqual([empty.stdout, empty.code]);
      const open = await runHook(id, partial, false, { FUSE_HOOK_STDIN_IDLE_MS: "300", FUSE_HOOK_STDIN_PARTIAL_MS: "600" });
      expect(open.hung).toBe(false);
      expect(open.stdout).toContain("denied uninspected");
    }, 30000);

    test("(d) oversize unchanged: closed and open stdin give the same fail-closed stdout", async () => {
      const env = { FUSE_HOOK_STDIN_MAX_BYTES: "1024" };
      const big = JSON.stringify({ hook_event_name: "PreToolUse", session_id: "s", tool_name: "Bash", tool_input: { command: "x".repeat(4096) } });
      const closed = await runHook(id, big, true, env);
      const open = await runHook(id, big, false, env);
      expect(closed.hung).toBe(false);
      expect(closed.stdout).toContain("denied uninspected");
      expect(open.hung).toBe(false);
      expect(open.stdout).toBe(closed.stdout);
      expect(open.code).toBe(closed.code);
    }, 30000);
  });
}

/** Challenger reproducer: a PreToolUse payload split mid-object, second half after a stall longer than the idle window. */
const pushHead = (id: string): string => `{"hook_event_name":"PreToolUse","session_id":"s-${id}","cwd":"${sandbox}","tool_name":"Bash",`;
const pushTail = '"tool_input":{"command":"git push --force origin main"}}';

for (const id of ["codex", "claude-code"]) {
  describe(`hook ${id}: partial payload is not abandoned at the idle window`, () => {
    test("(b) stall > idle but < partial bound, then rest + EOF: same stdout and code as the closed full payload (deny)", async () => {
      const env = { FUSE_HOOK_STDIN_IDLE_MS: "300", FUSE_HOOK_STDIN_PARTIAL_MS: "5000" };
      const main = await runHook(id, [pushHead(id) + pushTail], true);
      const stalled = await runHook(id, [pushHead(id), pushTail], true, env, 800);
      expect(main.stdout).toContain("deny");
      expect(stalled.hung).toBe(false);
      expect([stalled.stdout, stalled.code]).toEqual([main.stdout, main.code]);
    }, 30000);

    test("(c) partial bound expires: fail CLOSED on a blockable event, neutral on an observation-only one", async () => {
      const env = { FUSE_HOOK_STDIN_IDLE_MS: "300", FUSE_HOOK_STDIN_PARTIAL_MS: "600" };
      const blockable = await runHook(id, pushHead(id), false, env);
      expect(blockable.hung).toBe(false);
      expect(blockable.stdout).toContain("deny");
      const post = `{"hook_event_name":"PostToolUse","session_id":"s-${id}","tool_name":"Bash",`;
      const observe = await runHook(id, post, false, env);
      expect([observe.hung, observe.stdout]).toEqual([false, ""]);
      const undeterminable = await runHook(id, '{"session_id":"s",', false, env);
      expect(undeterminable.hung).toBe(false);
      expect(undeterminable.stdout).toContain("deny");
    }, 30000);
  });
}

describe("worker tier (FUSE_HOOK_STDIN_POLL=0: the Node / no-ffi fallback) behaves the same", () => {
  const env = { FUSE_HOOK_STDIN_POLL: "0", FUSE_HOOK_STDIN_PARTIAL_MS: "600" };
  test("payload with stdin open exits with the closed-stdin stdout; empty never-closed stdin fails closed at the bound", async () => {
    for (const id of ["codex", "claude-code"]) {
      const closed = await runHook(id, pre(id), true, env);
      const open = await runHook(id, pre(id), false, env);
      expect([open.hung, open.stdout, open.code]).toEqual([false, closed.stdout, closed.code]);
      const idle = await runHook(id, null, false, env);
      expect([idle.hung, idle.code]).toEqual([false, 0]);
    }
  }, 40000);
});

describe("hook cursor: malformed stdin stays fail-closed", () => {
  test("(e) malformed JSON, stdin closed: exit 1, no stdout", async () => {
    const r = await runHook("cursor", "{not json", true);
    expect(r.hung).toBe(false);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe("");
  }, 20000);

  test("(e2) partial JSON, stdin left open: fails closed at the partial bound (Cursor deny), not an early exit 1", async () => {
    const r = await runHook("cursor", '{"hook_event_name":"preToolUse"', false, { FUSE_HOOK_STDIN_IDLE_MS: "300", FUSE_HOOK_STDIN_PARTIAL_MS: "600" });
    expect(r.hung).toBe(false);
    expect(r.stdout).toContain("denied uninspected");
  }, 20000);
});
