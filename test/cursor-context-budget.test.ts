import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toCursorLifecycleResponse } from "../src/adapters/cursor/respond";
import { reserveAdditionalContext, recordAdditionalContext } from "../src/adapters/cursor/context-budget";
import { projectHash } from "../src/runtime/paths";
import { fuseHarnessHome } from "../src/runtime/home-state";
import { handleHook } from "../src/runtime/handle";
import { apexDocName, harnessHomeSegment } from "../src/policy/apex-target";

const BIN = join(import.meta.dir, "..", "src", "cli", "bin.ts");
const TRUNCATION_MARKER = "\n[fuse-harness] additional_context truncated to Cursor's 10000-char limit";

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}
function registryOf(stateDir: string): Record<string, { at: number; length: number }[]> {
  return JSON.parse(readFileSync(join(stateDir, "cursor-context-budget.json"), "utf8"));
}
function sessionStartWith(length: number): string {
  return JSON.stringify({ additional_context: "x".repeat(length) });
}
/**
 * Same `${home}/.fuse-harness/state/<projectHash>` layout as
 * `handleHook`'s Cursor budget `stateDir` (see `src/runtime/handle.ts`) —
 * used by in-process `handleHook` tests below (and by
 * `cursor-context-budget-guards.test.ts`, split out for the SOLID line
 * ceiling) so they never touch the real `os.homedir()` (F1: no real
 * `~/.fuse-harness/state` writes from tests).
 */
export function isolatedStateDir(home: string, cwd: string): string {
  return join(fuseHarnessHome(home), "state", projectHash(cwd));
}
function run(id: string, scope: string, payload: unknown, cwd: string, env?: Record<string, string>): { stdout: string; status: number | null } {
  const r = spawnSync("bun", [BIN, "hook", id, scope], {
    input: JSON.stringify(payload),
    cwd,
    encoding: "utf8",
    ...(env ? { env: { ...process.env, ...env } } : {}),
  });
  return { stdout: r.stdout, status: r.status };
}
test("1st hook: intact, registry written with the full length", () => {
  const stateDir = tmp("cursor-budget-1-");
  try {
    const budget = { stateDir, sessionId: "s1", event: "sessionStart" };
    const out = sessionStartWith(7140);
    expect(toCursorLifecycleResponse(out, "sessionStart", budget)).toBe(out);
    expect(registryOf(stateDir)["s1|sessionStart||"]).toEqual([{ at: expect.any(Number), length: 7140 }]);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("2nd hook same key: truncated to 10000 - 7140 - 9 = 2851, registry holds 2 entries", () => {
  const stateDir = tmp("cursor-budget-2-");
  try {
    const budget = { stateDir, sessionId: "s2", event: "sessionStart" };
    toCursorLifecycleResponse(sessionStartWith(7140), "sessionStart", budget);
    const rendered = toCursorLifecycleResponse(sessionStartWith(3000), "sessionStart", budget);
    const { additional_context } = JSON.parse(rendered) as { additional_context: string };
    expect(additional_context.length).toBe(2851);
    expect(additional_context.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(registryOf(stateDir)["s2|sessionStart||"]?.map((e) => e.length)).toEqual([7140, 2851]);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("3rd hook same key: budget exhausted, additional_context omitted, stderr warns", () => {
  const stateDir = tmp("cursor-budget-3-");
  const originalWrite = process.stderr.write.bind(process.stderr);
  let captured = "";
  process.stderr.write = ((chunk: string) => { captured += chunk; return true; }) as typeof process.stderr.write;
  try {
    const budget = { stateDir, sessionId: "s3", event: "sessionStart" };
    toCursorLifecycleResponse(sessionStartWith(7140), "sessionStart", budget);
    toCursorLifecycleResponse(sessionStartWith(3000), "sessionStart", budget);
    const rendered = toCursorLifecycleResponse(sessionStartWith(500), "sessionStart", budget);
    expect(JSON.parse(rendered)).not.toHaveProperty("additional_context");
    expect(captured).toContain("budget exhausted");
    expect(captured).toContain("sessionStart");
  } finally {
    process.stderr.write = originalWrite;
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("a different key (session/event/generation) is an independent budget", () => {
  const stateDir = tmp("cursor-budget-4-");
  try {
    const first = { stateDir, sessionId: "s4a", event: "sessionStart" };
    const second = { stateDir, sessionId: "s4b", event: "sessionStart" };
    toCursorLifecycleResponse(sessionStartWith(7140), "sessionStart", first);
    const out = sessionStartWith(7140);
    expect(toCursorLifecycleResponse(out, "sessionStart", second)).toBe(out);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("an entry older than 10s is ignored: budget is back to full", () => {
  const stateDir = tmp("cursor-budget-5-");
  try {
    const t0 = 1_000_000_000_000;
    recordAdditionalContext({ stateDir, sessionId: "s5", event: "sessionStart", now: t0, emitted: 9_999 });
    const { allowed } = reserveAdditionalContext({ stateDir, sessionId: "s5", event: "sessionStart", now: t0 + 11_000, wanted: 100 });
    expect(allowed).toBe(10_000);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("unreadable registry directory fails open to the flat per-response cap", () => {
  const root = tmp("cursor-budget-6-");
  const blockerFile = join(root, "blocker");
  writeFileSync(blockerFile, "");
  const unwritableStateDir = join(blockerFile, "state"); // parent segment is a FILE -> mkdirSync throws ENOTDIR
  try {
    const budget = { stateDir: unwritableStateDir, sessionId: "s6", event: "sessionStart" };
    const renderedOver = JSON.parse(toCursorLifecycleResponse(sessionStartWith(12_000), "sessionStart", budget)) as { additional_context: string };
    expect(renderedOver.additional_context.length).toBeLessThanOrEqual(10_000);
    expect(renderedOver.additional_context.endsWith(TRUNCATION_MARKER)).toBe(true);

    const under = sessionStartWith(9_000);
    expect(toCursorLifecycleResponse(under, "sessionStart", budget)).toBe(under);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("corrupt registry JSON fails open the same way", () => {
  const stateDir = tmp("cursor-budget-6b-");
  writeFileSync(join(stateDir, "cursor-context-budget.json"), "{not valid json");
  try {
    const budget = { stateDir, sessionId: "s6b", event: "sessionStart" };
    const under = sessionStartWith(9_000);
    expect(toCursorLifecycleResponse(under, "sessionStart", budget)).toBe(under);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

/** status===0 and stdout empty-or-valid-JSON — the only claim independent of ambient $HOME content. */
function expectWellFormed(r: { stdout: string; status: number | null }): void {
  expect(r.status).toBe(0);
  const t = r.stdout.trim();
  expect(t === "" || (() => { JSON.parse(t); return true; })()).toBe(true);
}

test("non-regression: claude-code and codex never touch the budget registry, stdout stays well-formed", () => {
  // Hermetic (was the CI bug): dedicated tmp HOME per id + a planted minimal
  // root doc as a positive witness — a bare CI $HOME has neither doc, so "" was legit and JSON.parse("") threw.
  const dirs = [tmp("cursor-budget-7-a-"), tmp("cursor-budget-7-b-"), tmp("cursor-budget-7-c-"), tmp("cursor-budget-7-d-")];
  const homes = [tmp("cursor-budget-7-home-a-"), tmp("cursor-budget-7-home-b-")];
  try {
    let i = 0, h = 0;
    for (const id of ["claude-code", "codex"]) {
      const sessionCwd = dirs[i++]!, promptCwd = dirs[i++]!, home = homes[h++]!;
      const docDir = join(home, harnessHomeSegment(id));
      mkdirSync(docDir, { recursive: true });
      writeFileSync(join(docDir, apexDocName(id)), "# fixture\nRules.\n");
      const sessionStart = run(id, "core", { hook_event_name: "SessionStart", session_id: "reg-sid", cwd: sessionCwd }, sessionCwd, { HOME: home, CURSOR_PROJECT_DIR: sessionCwd });
      expectWellFormed(sessionStart);
      if (sessionStart.stdout.trim()) expect(JSON.parse(sessionStart.stdout)).toHaveProperty("hookSpecificOutput.hookEventName", "SessionStart");
      const promptSubmit = run(id, "core", { hook_event_name: "UserPromptSubmit", session_id: "reg-sid", cwd: promptCwd, prompt: "hello" }, promptCwd, { HOME: home, CURSOR_PROJECT_DIR: promptCwd });
      expectWellFormed(promptSubmit);
      if (promptSubmit.stdout.trim()) expect(JSON.parse(promptSubmit.stdout)).toHaveProperty("hookSpecificOutput.hookEventName", "UserPromptSubmit");
      expect(() => registryOf(isolatedStateDir(home, sessionCwd))).toThrow();
      expect(() => registryOf(isolatedStateDir(home, promptCwd))).toThrow();
    }
  } finally {
    for (const dir of [...dirs, ...homes]) rmSync(dir, { recursive: true, force: true });
  }
});

test("end-to-end via handleHook: two scopes on the same cursor sessionStart share one budget", async () => {
  // F1: `home: cwd` keeps this test off the real `os.homedir()` — the
  // registry then lives under `<cwd>/.fuse-harness/state/...`, nested inside
  // the tmpdir already cleaned up below (see `isolatedStateDir`).
  const cwd = tmp("cursor-budget-8-");
  const stateDir = isolatedStateDir(cwd, cwd);
  try {
    const payload = { hook_event_name: "sessionStart", session_id: "e2e-sid" };
    const lessons = await handleHook("cursor", payload, { now: Date.now(), cwd, scope: "lessons", home: cwd });
    const core = await handleHook("cursor", payload, { now: Date.now(), cwd, scope: "core", home: cwd });
    const lengthOf = (stdout: string): number => (stdout ? (JSON.parse(stdout) as { additional_context?: string }).additional_context?.length ?? 0 : 0);
    const total = lengthOf(lessons.stdout) + lengthOf(core.stdout);
    expect(total + 9).toBeLessThanOrEqual(10_000);
    const entries = registryOf(stateDir)["e2e-sid|sessionStart||"] ?? [];
    expect(entries.length).toBe(2);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});
