import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalizeMcpToolName } from "../src/runtime/mcp-tool-name";
import { normalizeEvent } from "../src/runtime/normalize";
import { docCacheGate } from "../src/runtime/lifecycle/aipilot/doc-cache-gate";
import { cacheDocFromTranscript } from "../src/runtime/lifecycle/aipilot/cache-doc";
import { cacheDirFor } from "../src/runtime/lifecycle/aipilot/cache-base";

/**
 * Codex CLI globally rewrites `-` -> `_` across the full qualified MCP tool
 * identifier before it reaches a hook (openai/codex#14605,
 * `sanitize_responses_api_tool_name()`) — proven to reach hooks by
 * openai/codex#18385's `SCENARIO_DASH_TOOL` test. `mcp-tool-name.ts`
 * canonicalizes the 4 entries this repo's dash-keyed gates (SHOT_TOOLS,
 * RESEARCH_TOOLS, NAV/SCROLL/GEMINI, CONTEXT7_SOURCE) actually depend on,
 * via a closed table — never a generic regex (openai/codex#15832/#15565
 * document the rewrite as non-inversible).
 */

test("1) codex + underscore server/tool -> canonical dash form, all 4 table entries", () => {
  expect(canonicalizeMcpToolName("codex", "mcp__fuse_browser__browser_screenshot")).toBe("mcp__fuse-browser__browser_screenshot");
  expect(canonicalizeMcpToolName("codex", "mcp__gemini_design__create_frontend")).toBe("mcp__gemini-design__create_frontend");
  expect(canonicalizeMcpToolName("codex", "mcp__context7__query_docs")).toBe("mcp__context7__query-docs");
  expect(canonicalizeMcpToolName("codex", "mcp__context7__resolve_library_id")).toBe("mcp__context7__resolve-library-id");
});

test("2) codex + already-dash form -> unchanged (idempotent)", () => {
  for (const tool of [
    "mcp__fuse-browser__browser_screenshot",
    "mcp__gemini-design__create_frontend",
    "mcp__context7__query-docs",
    "mcp__context7__resolve-library-id",
  ]) {
    expect(canonicalizeMcpToolName("codex", tool)).toBe(tool);
  }
});

test("3) non-regression: every other harness id passes underscore forms through UNCHANGED", () => {
  for (const id of ["claude-code", "kimi", "cursor", "cline", "gemini-cli", "hermes"]) {
    expect(canonicalizeMcpToolName(id, "mcp__fuse_browser__browser_screenshot")).toBe("mcp__fuse_browser__browser_screenshot");
    expect(canonicalizeMcpToolName(id, "mcp__context7__query_docs")).toBe("mcp__context7__query_docs");
  }
});

test("4) traps: legitimately-underscored segments are NEVER rewritten, even on codex", () => {
  expect(canonicalizeMcpToolName("codex", "mcp__node_repl__run")).toBe("mcp__node_repl__run");
  expect(canonicalizeMcpToolName("codex", "mcp__exa__web_search_exa")).toBe("mcp__exa__web_search_exa");
  expect(canonicalizeMcpToolName("codex", "mcp__XcodeBuildMCP__build_sim")).toBe("mcp__XcodeBuildMCP__build_sim");
});

test("5) degenerate inputs -> unchanged, no throw, on codex", () => {
  for (const tool of ["", "mcp__", "mcp__x", "notmcp__a__b", "Bash"]) {
    expect(() => canonicalizeMcpToolName("codex", tool)).not.toThrow();
    expect(canonicalizeMcpToolName("codex", tool)).toBe(tool);
  }
});

test("5b) prototype-pollution-read: Object.prototype member names as server/tool segments never leak an inherited object/function into the result", () => {
  for (const key of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"]) {
    const server = canonicalizeMcpToolName("codex", `mcp__${key}__x`);
    expect(server).toBe(`mcp__${key}__x`);
    const tool = canonicalizeMcpToolName("codex", `mcp__fuse_browser__${key}`);
    expect(tool).toBe(`mcp__fuse-browser__${key}`);
  }
});

test("6) integration via normalizeEvent: codex underscore payload -> dash event.tool; claude-code underscore payload -> unchanged", () => {
  const codexEvent = normalizeEvent("codex", {
    hook_event_name: "PostToolUse",
    tool_name: "mcp__fuse_browser__browser_screenshot",
    tool_input: {},
    session_id: "s",
  });
  expect(codexEvent.tool).toBe("mcp__fuse-browser__browser_screenshot");

  const claudeEvent = normalizeEvent("claude-code", {
    hook_event_name: "PostToolUse",
    tool_name: "mcp__fuse_browser__browser_screenshot",
    tool_input: {},
    session_id: "s",
  });
  expect(claudeEvent.tool).toBe("mcp__fuse_browser__browser_screenshot");
});

test("7) composition with canonicalizeCodexShellTool: exec_command on codex still yields Bash", () => {
  const event = normalizeEvent("codex", {
    hook_event_name: "PostToolUse",
    tool_name: "exec_command",
    tool_input: { command: "cat foo.md" },
    session_id: "s",
  });
  expect(event.tool).toBe("Bash");
});

test("8) server scoping: TOOL_ALIASES rewrites ONLY when the canonical server is context7", () => {
  expect(canonicalizeMcpToolName("codex", "mcp__context7__query_docs")).toBe("mcp__context7__query-docs");
  expect(canonicalizeMcpToolName("codex", "mcp__context7__resolve_library_id")).toBe("mcp__context7__resolve-library-id");
  expect(canonicalizeMcpToolName("codex", "mcp__exa__query_docs")).toBe("mcp__exa__query_docs");
  expect(canonicalizeMcpToolName("codex", "mcp__shadcn__resolve_library_id")).toBe("mcp__shadcn__resolve_library_id");
  expect(canonicalizeMcpToolName("codex", "mcp__fuse_browser__query_docs")).toBe("mcp__fuse-browser__query_docs");
});

test("9) docCacheGate third ingestion path: underscore form gated on codex via canonicalization, NOT gated on claude-code", async () => {
  const project = mkdtempSync(join(tmpdir(), "fh-mcp-gate-"));
  const home = mkdtempSync(join(tmpdir(), "fh-mcp-gate-home-"));
  const docDir = cacheDirFor("doc", project, home);
  mkdirSync(join(docDir, "docs"), { recursive: true });
  writeFileSync(join(docDir, "index.json"), JSON.stringify({ docs: [{ library: "react", hash: "cafe01", timestamp: new Date().toISOString() }] }));
  writeFileSync(join(docDir, "docs", "cafe01.md"), "cached body");
  const payload = { tool_name: "mcp__context7__query_docs", tool_input: { libraryId: "react", query: "react" } };
  // Pin CLAUDE_PROJECT_DIR for the call (docCacheGate reads it ahead of `cwd`) — other
  // test files leave it set process-wide, so this test must not trust the ambient value.
  const prevProjDir = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = project;
  try {
    expect(await docCacheGate(payload, project, Date.now(), home, "codex")).toContain("\"permissionDecision\":\"deny\"");
    expect(await docCacheGate(payload, project, Date.now(), home, "claude-code")).toBeNull();
  } finally {
    if (prevProjDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = prevProjDir;
  }
});

/** A JSONL transcript with one tool_use (`toolName`, keyed to `library`) + a >200-char assistant text, so `cacheDocFromTranscript` clears BOTH its early-exit conditions in one pass. */
function transcriptWithToolUse(dir: string, file: string, toolName: string, library: string): string {
  const path = join(dir, file);
  const line = JSON.stringify({
    type: "assistant",
    message: { content: [
      { type: "tool_use", name: toolName, input: { libraryId: library, query: "q" } },
      { type: "text", text: "x".repeat(220) },
    ] },
  });
  writeFileSync(path, `${line}\n`);
  return path;
}

test("10) cacheDocFromTranscript fifth ingestion path: underscore tool_use.name populates the cache on codex via canonicalization, NOT on claude-code (witnessed against a dash-form control)", async () => {
  const project = mkdtempSync(join(tmpdir(), "fh-cache-doc-"));
  const home = mkdtempSync(join(tmpdir(), "fh-cache-doc-home-"));
  const docDir = cacheDirFor("doc", project, home);
  const prevProjDir = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = project;
  try {
    // Positive witness FIRST: known-good dash form on claude-code MUST populate the
    // cache — proves this fixture/harness actually exercises the write path before
    // any negative result below is trusted (a dead probe would "pass" vacuously).
    await cacheDocFromTranscript(transcriptWithToolUse(project, "witness.jsonl", "mcp__context7__query-docs", "witness-lib"), project, home, "claude-code");
    let index = JSON.parse(readFileSync(join(docDir, "index.json"), "utf8"));
    expect(index.docs.some((d: { library: string }) => d.library === "witness-lib")).toBe(true);

    // codex: underscore form must ALSO populate the cache, via canonicalization.
    await cacheDocFromTranscript(transcriptWithToolUse(project, "codex.jsonl", "mcp__context7__query_docs", "codex-lib"), project, home, "codex");
    index = JSON.parse(readFileSync(join(docDir, "index.json"), "utf8"));
    expect(index.docs.some((d: { library: string }) => d.library === "codex-lib")).toBe(true);

    // claude-code: the SAME underscore form must NOT populate the cache (non-regression).
    await cacheDocFromTranscript(transcriptWithToolUse(project, "claude.jsonl", "mcp__context7__query_docs", "claude-lib"), project, home, "claude-code");
    index = JSON.parse(readFileSync(join(docDir, "index.json"), "utf8"));
    expect(index.docs.some((d: { library: string }) => d.library === "claude-lib")).toBe(false);
  } finally {
    if (prevProjDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = prevProjDir;
  }
});
