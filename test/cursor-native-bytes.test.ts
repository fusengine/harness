import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bin, runtime } from "./cursor-cli-p0.test";
import { CASES } from "./cursor-native-bytes-cases";

/**
 * Run the Cursor CLI hook in an isolated temp `cwd` (never the repo root, so
 * the harness's own side-channel writes — e.g. `.cursor/apex/docs/`
 * doc-consultation notes, session track files keyed by `CLAUDE_PROJECT_DIR`
 * — never land in this checkout). `HOME` is ALSO pinned to `cwd` (F1): the
 * spawned child reads it fresh at process start, so any Cursor
 * `additional_context` budget registry write (e.g. a sessionStart payload)
 * lands under `<cwd>/.fuse-harness/state/...` instead of the real
 * `~/.fuse-harness/state/...` — cleaned up by the same `rmSync(cwd, ...)`.
 * @param input - Raw stdin bytes fed to the CLI.
 * @param cwd - Isolated temp directory used as both process cwd, project root, and HOME.
 */
function runIsolated(input: string, cwd: string): { exit: number; stdout: string } {
  const child = spawnSync(runtime, [bin, "hook", "cursor", "core"], {
    input,
    cwd,
    encoding: "utf8",
    env: { ...process.env, FUSE_ENFORCE_TTL_SEC: "3600", CLAUDE_PROJECT_DIR: cwd, HOME: cwd },
  });
  return { exit: child.status ?? 1, stdout: child.stdout };
}

test("Cursor CLI emits the exact documented stdout bytes for every known event's neutral/allow path, plus one unknown event", () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-native-bytes-"));
  try {
    for (const { event, payload, stdout } of CASES) {
      const result = runIsolated(JSON.stringify(payload(cwd)), cwd);
      expect(result, event).toEqual({ exit: 0, stdout });
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

// `sessionStart` is EXCLUDED from the table above on purpose: its
// `additional_context` embeds this repo's own live `package.json` version and
// a git-branch/gate-history reconciliation snapshot (src/runtime/lifecycle/
// snapshot/version.ts reads `<harness root>/package.json`, unrelated to the
// event's `cwd`) — content that changes on every patch-version commit. A
// hardcoded `toBe()` would break on the very next release, so this asserts
// the stable, harness-contract-relevant shape instead — the same reasoning
// the mandate itself applies to the `rm -rf /` deny row below (prefix-only,
// because of a persisted one-shot-gate repeat counter).
test("Cursor sessionStart stays on the documented session-context shape (byte-unstable: embeds live harness version/git state)", () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-native-bytes-session-"));
  try {
    const result = runIsolated(JSON.stringify({ hook_event_name: "sessionStart", workspace_roots: [cwd], cwd }), cwd);
    expect(result.exit).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["additional_context"]);
    expect(typeof parsed.additional_context).toBe("string");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("Cursor CLI cross-cutting stdout bytes: malformed JSON, empty stdin, and native deny", () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-native-bytes-cross-"));
  try {
    expect(runIsolated("{not-json", cwd)).toEqual({ exit: 1, stdout: "" });
    expect(runIsolated("", cwd)).toEqual({ exit: 0, stdout: "{}" });
    // The reason text carries a persisted, ever-incrementing one-shot-gate
    // repeat counter ("[REPEAT] ... attempt #N") — the mandate scopes this
    // row to the stable prefix, not the full byte string, for that reason.
    const denied = runIsolated(
      JSON.stringify({ hook_event_name: "preToolUse", tool_name: "Shell", tool_input: { command: "rm -rf /", cwd } }),
      cwd,
    );
    expect(denied.exit).toBe(0);
    expect(denied.stdout.startsWith('{"permission":"deny",')).toBe(true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("Cursor native-bytes table covers exactly the 21 documented events plus one unknown event", () => {
  expect(CASES.length).toBe(21);
  expect(new Set(CASES.map((c) => c.event)).size).toBe(21);
});
