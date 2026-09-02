import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleHook } from "../src/runtime/handle";
import { normalizeEvent } from "../src/runtime/normalize";
import { FIXTURE_CASES } from "./cursor-authentic-fixtures-cases";

const FIXTURES_ROOT = join(import.meta.dir, "fixtures", "cursor");

/** Recursively list every `*.json` fixture path under `FIXTURES_ROOT`, relative to it. */
function walkFixtures(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = prefix ? join(prefix, name) : name;
    if (statSync(abs).isDirectory()) out.push(...walkFixtures(abs, rel));
    else if (name.endsWith(".json")) out.push(rel);
  }
  return out.sort();
}

/**
 * Rewrite every occurrence of the fixtures' sanitized home placeholder
 * (`/Users/user`) to an isolated temp project dir, so `handleHook`'s internal
 * cache/state writes land there instead of attempting a real, unwritable
 * `/Users/user/**` path on the test machine (verified: without this rebase,
 * `postToolUse`/`afterMCPExecution`-shaped fixtures crash with `EACCES:
 * permission denied, mkdir '/Users/user'` from `src/cache/store.ts`).
 * @param stdin - The fixture's raw `stdin` object (read-only; the on-disk
 * fixture file itself is never mutated).
 * @param projectDir - The isolated temp directory standing in for `/Users/user`.
 */
function rebase(stdin: Record<string, unknown>, projectDir: string): Record<string, unknown> {
  return JSON.parse(JSON.stringify(stdin).replaceAll("/Users/user", projectDir)) as Record<string, unknown>;
}

/** Load one fixture's `stdin` field from disk (unmodified). */
function loadFixture(relPath: string): Record<string, unknown> {
  const raw = JSON.parse(readFileSync(join(FIXTURES_ROOT, relPath), "utf8")) as { stdin: Record<string, unknown> };
  return raw.stdin;
}

test("every fixture on disk has exactly one matching case (no drift between the two)", () => {
  const onDisk = walkFixtures(FIXTURES_ROOT);
  const cased = FIXTURE_CASES.map((c) => c.relPath).sort();
  expect(cased).toEqual(onDisk);
});

for (const testCase of FIXTURE_CASES) {
  test(`Cursor fixture ${testCase.relPath}: handleHook stdout/exit${testCase.isMcp ? " (MCP: bytes only)" : " + normalized extraction"}`, async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cursor-authentic-fixture-"));
    try {
      const rawStdin = loadFixture(testCase.relPath);
      const stdin = rebase(rawStdin, cwd);
      // F1: `home: cwd` keeps the Cursor budget registry (see
      // `handleHook`/`context-budget.ts`) off the real `os.homedir()` — any
      // write lands under `<cwd>/.fuse-harness/state/...`, cleaned up below.
      const outcome = await handleHook("cursor", stdin, { now: 1_700_000_000_000, cwd, scope: "core", home: cwd });

      expect(outcome.exit, testCase.relPath).toBe(0);
      if (testCase.expectedStdout === null) {
        // sessionStart only: byte-unstable (embeds live harness version/git state).
        const parsed = JSON.parse(outcome.stdout) as Record<string, unknown>;
        expect(Object.keys(parsed), testCase.relPath).toEqual(["additional_context"]);
        expect(typeof parsed.additional_context, testCase.relPath).toBe("string");
      } else {
        expect(outcome.stdout, testCase.relPath).toBe(testCase.expectedStdout);
      }
      if (testCase.isMcp) return; // MCP fixtures: stdout bytes only (mandate scope).

      const normalized = normalizeEvent("cursor", stdin);
      const expectedSessionId = typeof stdin.session_id === "string"
        ? stdin.session_id
        : typeof stdin.conversation_id === "string" ? stdin.conversation_id : "";
      expect(normalized.sessionId, testCase.relPath).toBe(expectedSessionId);
      expect(Array.isArray(stdin.workspace_roots) ? stdin.workspace_roots.length : 0, `${testCase.relPath} root count`)
        .toBe(normalized.workspaceRoots?.length ?? 0);
      if (Array.isArray(stdin.workspace_roots)) {
        expect(normalized.workspaceRoots, `${testCase.relPath} root order`).toEqual(stdin.workspace_roots);
      }
      // An empty-string `cwd` (real Cursor Shell captures use `cwd: ""`) is not
      // a valid absolute path, so `cursorAbsolutePath` correctly drops it to
      // `undefined` rather than preserving the empty string verbatim.
      if (testCase.hasTopCwd) {
        expect(normalized.cwd, testCase.relPath).toBe((stdin.cwd as string | undefined) || undefined);
      }
      if (testCase.filePathSource === "top") {
        expect(normalized.filePath, testCase.relPath).toBe(stdin.file_path as string | undefined);
      }
      if (testCase.filePathSource === "tool_input") {
        const toolInput = stdin.tool_input as Record<string, unknown>;
        expect(normalized.filePath, testCase.relPath).toBe(toolInput.file_path as string | undefined);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}

test("preToolUse multi-root fixture preserves both workspace roots in wire order", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-authentic-fixture-multiroot-"));
  try {
    const stdin = rebase(loadFixture("preToolUse/07-multi-root-synthetic.json"), cwd);
    const normalized = normalizeEvent("cursor", stdin);
    expect(normalized.workspaceRoots).toEqual([join(cwd, "project-a"), join(cwd, "project-b")]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("Shell-shaped fixture preserves `command`; `commandCandidates` stays undefined (beforeMCPExecution-only per normalize.ts)", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-authentic-fixture-shell-"));
  try {
    const stdin = rebase(loadFixture("preToolUse/02-shell-top-level-cwd.json"), cwd);
    const normalized = normalizeEvent("cursor", stdin);
    const toolInput = stdin.tool_input as Record<string, unknown>;
    expect(normalized.command).toBe(toolInput.command as string | undefined);
    expect(normalized.commandCandidates).toBeUndefined();
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
