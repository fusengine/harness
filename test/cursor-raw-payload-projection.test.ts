import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleHook } from "../src/runtime/handle";
import { normalizeEvent } from "../src/runtime/normalize";
import { failureLessonContext } from "../src/runtime/lifecycle/failure-lesson";
import { trackAgentMemory } from "../src/runtime/lifecycle/agent-memory";
import { cursorProjectCwd } from "../src/adapters/cursor/context";
import { saveSessionState } from "../src/runtime/home-state";
import { loadState, SIDECAR } from "../src/tracking/one-shot";
import { defaultStateDir } from "../src/runtime/paths";

/**
 * B1 (`handle.ts`'s `cursorRawPayloadProjection`) proven at three safe,
 * hermetic layers:
 *  - memory + seo scopes: full `handleHook` end-to-end (no real-home writes
 *    on THOSE two code paths — `dispatchMemory`/`seoPostToolUseResponse`
 *    never touch `homedir()`).
 *  - failure-lesson / agent-memory: `dispatch.ts`'s `dispatchLifecycle`
 *    (out of this WP's ownership) hardcodes `home: undefined` when wiring
 *    `failureLessonContext`/`trackAgentMemory` for BOTH `PostToolUseFailure`
 *    and `SubagentStop` — going through the full pipeline for these two
 *    events would append to the REAL `~/.claude/logs/tool-failures.log`
 *    (hard-stop: never write to the real `~/.claude`). So — matching this
 *    repo's own convention (`test/failure-lesson.test.ts`,
 *    `test/agent-memory-stop.test.ts`, both call the handler directly with
 *    an injected tmp `home`) — these two are exercised directly, fed the
 *    EXACT payload shape `cursorRawPayloadProjection` produces (its
 *    `tool_name`/`cwd` values are obtained from the REAL `normalizeEvent`/
 *    `cursorProjectCwd` functions, never hand-typed).
 */

// --- memory scope: dispatchMemory sees the canonical tool (real end-to-end) ---

test("Cursor postToolUse 'Shell' (raw) + command canonicalizes to 'Bash' and reaches dispatchMemory's captureBashError branch", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "fh-raw-memory-"));
  const payload = {
    hook_event_name: "postToolUse",
    session_id: "cursor-raw-memory",
    tool_name: "Shell",
    command: "false",
    tool_input: { command: "false" },
    tool_result: { exit_code: 1, stderr: "error: boom" },
  };
  const out = await handleHook("cursor", payload, { cwd, now: 1, scope: "memory", home: cwd });
  // dispatchMemory's `tool === "Bash"` branch was reached (captureBashError
  // returns a non-empty additionalContext when severity clears the salience
  // threshold) — impossible before B1, since raw "Shell" never equals "Bash".
  expect(out.stdout.length).toBeGreaterThan(0);
  expect(out.stdout).toContain("qdrant");
});

test("non-regression: the SAME 'Shell'+command payload on claude-code/codex never gets rewritten to 'Bash' (memory scope stays a no-op)", async () => {
  for (const id of ["claude-code", "codex"]) {
    const cwd = mkdtempSync(join(tmpdir(), "fh-raw-memory-noreg-"));
    const payload = {
      hook_event_name: "PostToolUse",
      session_id: "noreg-memory",
      tool_name: "Shell",
      tool_input: {},
      tool_result: { exit_code: 1, stderr: "error: boom" },
    };
    expect(normalizeEvent(id, payload).tool).toBe("Shell");
    const out = await handleHook(id, payload, { cwd, now: 1, scope: "memory" });
    expect(out.stdout).not.toContain("qdrant");
  }
});

// --- seo scope: post-tool-use.ts sees the resolved project cwd, not dirname(path) ---

test("Cursor postToolUse (seo scope): post-tool-use.ts resolves the SEO marker from the projected project cwd, not dirname(file_path)", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "fh-raw-seo-project-"));
  writeFileSync(join(projectRoot, ".fuse-seo"), "");
  const elsewhere = mkdtempSync(join(tmpdir(), "fh-raw-seo-elsewhere-"));
  const htmlFile = join(elsewhere, "page.html");
  writeFileSync(htmlFile, "<html><body>no seo tags here</body></html>");

  const payload = {
    hook_event_name: "postToolUse",
    session_id: "cursor-raw-seo",
    tool_name: "Edit",
    tool_input: { file_path: htmlFile },
    workspace_roots: [projectRoot],
  };
  // opts.cwd deliberately wrong (neither projectRoot nor elsewhere) — the fix
  // must resolve the REAL project root from workspace_roots, not this value.
  const wrongFallback = mkdtempSync(join(tmpdir(), "fh-raw-seo-fallback-"));
  const out = await handleHook("cursor", payload, { cwd: wrongFallback, now: 1, scope: "seo", home: wrongFallback });
  expect(out.stdout).toContain("fuse-seo: missing SEO elements");
});

test("non-regression: the SAME cross-directory seo payload on claude-code never gains a project-cwd it wasn't given", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "fh-raw-seo-project2-"));
  writeFileSync(join(projectRoot, ".fuse-seo"), "");
  const elsewhere = mkdtempSync(join(tmpdir(), "fh-raw-seo-elsewhere2-"));
  const htmlFile = join(elsewhere, "page.html");
  writeFileSync(htmlFile, "<html><body>no seo tags here</body></html>");

  const payload = {
    hook_event_name: "PostToolUse",
    session_id: "noreg-seo",
    tool_name: "Edit",
    tool_input: { file_path: htmlFile },
  };
  const wrongFallback = mkdtempSync(join(tmpdir(), "fh-raw-seo-fallback2-"));
  const out = await handleHook("claude-code", payload, { cwd: wrongFallback, now: 1, scope: "seo" });
  // claude-code payload carries no `cwd`/`workspace_roots` either: falls back
  // to dirname(htmlFile) = `elsewhere`, which has no `.fuse-seo` marker.
  expect(out.stdout).not.toContain("fuse-seo:");
});

// --- failure-lesson: data.tool_name arrives canonical ("Bash", not "Shell") ---

test("Cursor postToolUseFailure 'Shell'+command canonicalizes to 'Bash' before failure-lesson reads it (payload shape B1 produces)", () => {
  const cwd = mkdtempSync(join(tmpdir(), "fh-raw-faillesson-"));
  const home = mkdtempSync(join(tmpdir(), "fh-raw-faillesson-home-"));
  const rawPayload = { hook_event_name: "postToolUseFailure", tool_name: "Shell", command: "false", session_id: "s1", error: "boom" };
  const canonicalTool = normalizeEvent("cursor", rawPayload).tool;
  expect(canonicalTool).toBe("Bash");
  // The exact shape cursorRawPayloadProjection builds: tool_name overridden to
  // event.tool, original preserved under cursor_tool_name.
  const projected = { ...rawPayload, cursor_tool_name: rawPayload.tool_name, tool_name: canonicalTool };
  failureLessonContext(projected, cwd, home, 1000, () => true);
  const state = loadState(join(defaultStateDir(cwd), SIDECAR));
  expect(state.failures?.Bash).toBe(1);
  expect(state.failures?.Shell).toBeUndefined();
});

// --- agent-memory: data.cwd arrives as the resolved project root, not process.cwd() ---

test("Cursor subagentStop with workspace_roots (no 'cwd' field) resolves to the project root via cursorProjectCwd (payload shape B1 produces)", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-raw-agentmem-home-"));
  const projectRoot = mkdtempSync(join(tmpdir(), "fh-raw-agentmem-project-"));
  const touched = join(projectRoot, "touched.ts");
  writeFileSync(touched, "export const x = 1;\n");
  saveSessionState("s-agentmem", { changes: { cumulativeCodeFiles: 1, modifiedFiles: ["touched.ts"] } }, home);

  // Ground truth: Cursor's subagentStop payload has NO `cwd` field, only
  // `workspace_roots` — mirrors cursorProjectCwd's own resolution order.
  const resolvedCwd = cursorProjectCwd(undefined, [projectRoot], undefined, "/should-not-be-used");
  expect(resolvedCwd).toBe(projectRoot);

  const out = trackAgentMemory({ agent_type: "react-expert", session_id: "s-agentmem", cwd: resolvedCwd }, home, 1000);
  expect(out).toContain("modified 1 code file(s): touched.ts");
});
