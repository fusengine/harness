import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { handleHook } from "../src/runtime/handle";
import { cacheDirFor } from "../src/runtime/lifecycle/aipilot/cache-base";

/**
 * `dispatchAipilot` threads the REAL `homedir()` for the aipilot scope
 * (`handle-scope-async.ts` never forwards `opts.home`) — same established
 * precedent as `test/parity-b4-aipilot-hooks.test.ts` and
 * `test/mcp-tool-name.test.ts` test 9: seed the doc cache under the real
 * home, scoped by a unique per-test `CLAUDE_PROJECT_DIR` hash, and clean up.
 */
function seedDocCache(project: string, library: string): string {
  const docDir = cacheDirFor("doc", project, homedir());
  mkdirSync(join(docDir, "docs"), { recursive: true });
  writeFileSync(join(docDir, "index.json"), JSON.stringify({
    docs: [{ library, hash: "cafe01", timestamp: new Date().toISOString() }],
  }));
  writeFileSync(join(docDir, "docs", "cafe01.md"), "cached body");
  return docDir;
}

function withProjectDir<T>(project: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = project;
  return fn().finally(() => {
    if (prev === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = prev;
  });
}

/**
 * Positive witness (B2 decision proven end-to-end): Cursor's `preToolUse`
 * `MCP:query-docs` form — server name lost, `tool_input` genuinely an
 * OBJECT per ground truth — reconstructs `mcp__context7__query-docs` via
 * normalize.ts's closed table, B1 projects it into `payload.tool_name`
 * ahead of `asyncScopeStdout`, and `docCacheGate` (aipilot scope) denies the
 * redundant call.
 */
test("Cursor preToolUse MCP:query-docs denies a cache-fresh doc call (B1 projection + B2 canonicalization)", async () => {
  const project = mkdtempSync(join(tmpdir(), "fh-cursor-doccache-"));
  await withProjectDir(project, async () => {
    const docDir = seedDocCache(project, "react");
    try {
      const payload = {
        hook_event_name: "preToolUse",
        session_id: "cursor-doccache-pos",
        tool_name: "MCP:query-docs",
        tool_input: { libraryId: "react", query: "react" },
      };
      const out = await handleHook("cursor", payload, { cwd: project, now: Date.now(), scope: "aipilot" });
      expect(JSON.parse(out.stdout).permission).toBe("deny");
      expect(out.exit).toBe(0);
    } finally {
      rmSync(docDir, { recursive: true, force: true });
    }
  });
});

/** Negative control (lesson: a probe without a matching cache fixture proves nothing). */
test("Cursor preToolUse MCP:query-docs allows when nothing is cached (negative control)", async () => {
  const project = mkdtempSync(join(tmpdir(), "fh-cursor-doccache-neg-"));
  await withProjectDir(project, async () => {
    const payload = {
      hook_event_name: "preToolUse",
      session_id: "cursor-doccache-neg",
      tool_name: "MCP:query-docs",
      tool_input: { libraryId: "vue", query: "vue" },
    };
    const out = await handleHook("cursor", payload, { cwd: project, now: Date.now(), scope: "aipilot" });
    expect(out).toEqual({ stdout: '{"permission":"allow"}', exit: 0 });
  });
});

/**
 * Now fixed: `beforeMCPExecution` (the form where Cursor DOES send
 * `mcp_server_name`, `tool_input` as a JSON STRING) denies a cache-fresh doc
 * call just like the `preToolUse MCP:` form above. This required two fixes
 * outside this WP's original ownership, extended by the coordinator after a
 * closed-literal grep proved `"BeforeMCPExecution"` is produced ONLY by
 * `src/adapters/cursor/events.ts` and consumed nowhere else:
 *  1. `dispatch-aipilot.ts:93` now also routes the literal lifecycle event
 *     `"BeforeMCPExecution"` to `docCacheGate` (previously only `"PreToolUse"`).
 *  2. `handle.ts`'s `cursorRawPayloadProjection` (Cursor-only) now parses
 *     `payload.tool_input` when it's a JSON-string into the equivalent
 *     object before forwarding — `doc-cache-gate.ts` itself is untouched.
 */
test("Cursor beforeMCPExecution denies a cache-fresh doc call (dispatch-aipilot BeforeMCPExecution route + handle.ts tool_input JSON-string projection)", async () => {
  const project = mkdtempSync(join(tmpdir(), "fh-cursor-doccache-mcpexec-"));
  await withProjectDir(project, async () => {
    const docDir = seedDocCache(project, "react");
    try {
      const payload = {
        hook_event_name: "beforeMCPExecution",
        session_id: "cursor-doccache-mcpexec",
        tool_name: "query-docs",
        mcp_server_name: "context7",
        tool_input: JSON.stringify({ libraryId: "react", query: "react" }),
      };
      const out = await handleHook("cursor", payload, { cwd: project, now: Date.now(), scope: "aipilot" });
      expect(JSON.parse(out.stdout).permission).toBe("deny");
      expect(out.exit).toBe(0);
    } finally {
      rmSync(docDir, { recursive: true, force: true });
    }
  });
});

/** Negative control for beforeMCPExecution (no cache -> allow). */
test("Cursor beforeMCPExecution allows when nothing is cached (negative control)", async () => {
  const project = mkdtempSync(join(tmpdir(), "fh-cursor-doccache-mcpexec-neg-"));
  await withProjectDir(project, async () => {
    const payload = {
      hook_event_name: "beforeMCPExecution",
      session_id: "cursor-doccache-mcpexec-neg",
      tool_name: "query-docs",
      mcp_server_name: "context7",
      tool_input: JSON.stringify({ libraryId: "vue", query: "vue" }),
    };
    const out = await handleHook("cursor", payload, { cwd: project, now: Date.now(), scope: "aipilot" });
    expect(out).toEqual({ stdout: '{"permission":"allow"}', exit: 0 });
  });
});

/**
 * Structural-guard regression (challenger finding): `dispatch-aipilot.ts`'s
 * `BeforeMCPExecution` route must be gated by `id === "cursor"`, NOT by the
 * event-name literal alone — `asyncScopeStdout` forwards the RAW,
 * unmodified `hook_event_name` for every non-Cursor id (no allowlist), so a
 * claude-code/codex payload that happens to carry the literal string
 * `"BeforeMCPExecution"` must NEVER reach `docCacheGate`.
 */
test("non-cursor id with a raw BeforeMCPExecution literal never reaches the doc-cache gate", async () => {
  for (const id of ["claude-code", "codex"]) {
    const project = mkdtempSync(join(tmpdir(), "fh-noncursor-mcpexec-"));
    await withProjectDir(project, async () => {
      const docDir = seedDocCache(project, "react");
      try {
        const payload = {
          hook_event_name: "BeforeMCPExecution",
          tool_name: "mcp__context7__query-docs",
          tool_input: { libraryId: "react", query: "react" },
        };
        const out = await handleHook(id, payload, { cwd: project, now: Date.now(), scope: "aipilot" });
        const parsed = out.stdout ? (JSON.parse(out.stdout) as { hookSpecificOutput?: { permissionDecision?: string } }) : {};
        expect(parsed.hookSpecificOutput?.permissionDecision).not.toBe("deny");
      } finally {
        rmSync(docDir, { recursive: true, force: true });
      }
    });
  }
});
