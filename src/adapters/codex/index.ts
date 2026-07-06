/**
 * OpenAI Codex CLI adapter (hook-mode). Codex's `PreToolUse` hook (since 2026)
 * uses the SAME shape as Claude Code — `tool_name`/`tool_input` in, and
 * `hookSpecificOutput.permissionDecision` out — so it reuses the Claude guard.
 * Config lives at `.codex/hooks.json`. Note: Codex parses but does NOT honor
 * `permissionDecision: "ask"` (deny only). Bash guards reliably; the SOLID /
 * file-size gate covers apply_patch at 0% — it keys off `tool_input.file_path`
 * (Write/Edit shape), which Codex's diff-carrying apply_patch never supplies.
 *
 * GUARD: do NOT wire a Codex `PermissionRequest` path here until `respond()`
 * emits Codex's own wire shape. It currently returns Claude Code's
 * `hookSpecificOutput.permissionDecision` envelope; reusing it for a Codex
 * permission request would ship a payload Codex cannot parse.
 */
export {
  readClaudeInput as readCodexInput,
  guard,
  denyResponse,
  contextResponse,
  type ClaudeHookInput as CodexHookInput,
} from "../claude";
