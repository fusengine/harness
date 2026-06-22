/**
 * OpenAI Codex CLI adapter (hook-mode). Codex's `PreToolUse` hook (since 2026)
 * uses the SAME shape as Claude Code — `tool_name`/`tool_input` in, and
 * `hookSpecificOutput.permissionDecision` out — so it reuses the Claude guard.
 * Config lives at `.codex/hooks.json`. Note: Codex parses but does NOT honor
 * `permissionDecision: "ask"` (deny only). Bash is reliable; apply_patch/MCP partial.
 */
export {
  readClaudeInput as readCodexInput,
  guard,
  denyResponse,
  contextResponse,
  type ClaudeHookInput as CodexHookInput,
} from "../claude";
