/**
 * @module codex-shell-tool
 * Canonicalizes a Codex-only shell `tool_name` alias to `"Bash"`, so every
 * existing `tool === "Bash"` consumer (activity credit, explore-tools
 * classification, the protected-path guard, the design corpus read gate, …)
 * treats a Code Mode exec dispatch exactly like a native Bash call — no
 * per-consumer change needed.
 *
 * A Code Mode-wrapped call (`functions.exec` -> `tools.exec_command(...)`)
 * surfaces via the generic `CoreToolRuntime` hook default (openai/codex#23757,
 * commit 5c20513), which keeps the raw function-tool name `"exec_command"`
 * verbatim — unlike a DIRECT `exec_command` dispatch, which
 * `ExecCommandHandler`'s own `pre_tool_use_payload` override re-labels
 * `"Bash"` (`tool_name: HookToolName::bash()`). This is the exact call chain
 * a real Codex CLI 0.146.0 session was observed emitting for a `sed -n` skill
 * read. Only ONE alias is confirmed here — `ToolName::plain("exec_command")`
 * in `core/src/tools/handlers/unified_exec/exec_command.rs`; `shell`,
 * `unified_exec`, `local_shell`, and `shell_command` were audited but not
 * evidenced as a distinct hook `tool_name` value, so they are deliberately
 * left out rather than guessed.
 * @packageDocumentation
 */

/** Codex `tool_name` values that are a shell execution but not literally `"Bash"`. */
const CODEX_SHELL_TOOL_ALIASES = new Set(["exec_command"]);

/**
 * Canonicalize a Codex-only shell tool alias to `"Bash"`. Scoped to
 * `id === "codex"` — every other harness id, and every non-aliased tool
 * name, passes through unchanged (see `test/codex-shell-read-credit.test.ts`
 * for the non-regression proof).
 * @param id - Harness adapter id (e.g. "codex", "claude-code", "kimi").
 * @param tool - Raw `tool_name` from the hook payload.
 */
export function canonicalizeCodexShellTool(id: string, tool: string): string {
  return id === "codex" && CODEX_SHELL_TOOL_ALIASES.has(tool) ? "Bash" : tool;
}
