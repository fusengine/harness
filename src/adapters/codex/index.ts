/**
 * OpenAI Codex CLI adapter (hook-mode). Codex's `PreToolUse` hook (since 2026)
 * uses the SAME envelope as Claude Code — `tool_name`/`tool_input` in,
 * `hookSpecificOutput.permissionDecision` out — so it shares Claude's readers.
 * Config lives at `.codex/hooks.json`.
 *
 * Two Codex-specific quirks this adapter closes (audit 2026-07-06):
 * 1. `apply_patch` is Codex's PRIMARY edit primitive; its payload is a freeform
 *    patch in `tool_input.command`, with NO `file_path`/`content`. Claude's guard
 *    keyed off those fields, so the SOLID/DRY gates saw NOTHING (enforcement 0%).
 *    Here the patch is parsed and each file is judged (one violating hunk denies).
 * 2. Codex parses but NEVER honors `permissionDecision: "ask"` (deny-only) — an
 *    `ask` silently fails open (verified: `pre_tool_use.rs` test
 *    `unsupported_permission_decision_fails_open`). Every `ask` is downgraded to
 *    an explicit deny.
 */
import { evaluate } from "../../policy/evaluate";
import { countLines } from "../../policy/file-size";
import { formatPrompt, type Prompt } from "../../prompt/types";
import { parseApplyPatch } from "./apply-patch";
import { commandToString } from "../../runtime/command-string";
import { contextResponse, denyResponse, informResponse, type ClaudeHookInput } from "../claude";
import { isBypassPermissions } from "./permission-mode";

export { readClaudeInput as readCodexInput, denyResponse, contextResponse, informResponse, type ClaudeHookInput as CodexHookInput } from "../claude";

const ASK_PREFIX = "[downgraded from ask — Codex has no interactive approval]";

/**
 * Render a portable {@link Prompt} as a Codex hook response, `ask` → explicit deny.
 * NOTE: the REAL wired route is `harness hook codex` → handleHook → respond.ts
 * (source of truth for the ask→deny downgrade); this thin export exists for
 * direct package consumers and is kept aligned so it never silently diverges.
 */
export function toCodexResponse(prompt: Prompt): string {
  const message = formatPrompt(prompt);
  if (prompt.kind === "inform") {
    return prompt.userMessage ? informResponse("PreToolUse", prompt.userMessage, prompt.reason ? message : "") : contextResponse("PreToolUse", message);
  }
  if (prompt.kind === "ask") return denyResponse("PreToolUse", `${ASK_PREFIX}\n${message}`);
  return denyResponse("PreToolUse", message);
}

/** OR the per-file SOLID verdict of an `apply_patch` payload — first block wins. */
function applyPatchPrompt(command: string): Prompt | null {
  for (const f of parseApplyPatch(command)) {
    if (f.op === "delete") continue;
    const tool = f.op === "add" ? "Write" : "Edit";
    const r = evaluate({ tool, filePath: f.path, content: f.content, existingLines: countLines(f.content) });
    if (r.decision !== "allow" && r.prompt) return r.prompt;
  }
  return null;
}

/** Portable single-tool verdict for non-`apply_patch` Codex tools. */
function resolvePrompt(input: ClaudeHookInput): Prompt | null {
  const i = input.tool_input;
  const r = evaluate({
    tool: input.tool_name ?? "Write",
    filePath: i?.file_path,
    content: i?.content ?? i?.new_string,
    command: commandToString(i?.command),
    neverApproval: isBypassPermissions(input.permission_mode),
  });
  return r.decision === "allow" || !r.prompt ? null : r.prompt;
}

/**
 * Run the bundled policy over a Codex payload and return the native response
 * string (deny/additionalContext), or null to allow. `apply_patch` is fanned
 * into per-file checks; every other tool routes through the portable policy.
 */
export function guard(input: ClaudeHookInput): string | null {
  const prompt =
    input.tool_name === "apply_patch"
      ? applyPatchPrompt(commandToString(input.tool_input?.command) ?? "")
      : resolvePrompt(input);
  return prompt ? toCodexResponse(prompt) : null;
}
